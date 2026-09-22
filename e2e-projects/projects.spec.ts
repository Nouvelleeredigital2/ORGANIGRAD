import { test, expect, USER } from './fixture';

for (const viewport of [{ name: 'desktop', width: 1440, height: 1000 }, { name: 'mobile', width: 375, height: 812 }]) {
    test(`${viewport.name}: empty → forms → edits → reload → archive/restore → viewer`, async ({ page, fixture }, testInfo) => {
        await page.setViewportSize({ width: viewport.width, height: viewport.height });
        const projectName = 'TEST-SYNAPSE projet';
        const updatedProject = 'TEST-SYNAPSE projet modifié';
        const taskName = 'TEST-SYNAPSE tâche';
        const updatedTask = 'TEST-SYNAPSE tâche modifiée';
        const region = page.getByRole('region', { name: 'Projets', exact: true });
        const dialog = page.getByRole('dialog');
        const taskCard = region.getByRole('listitem').filter({ has: page.getByRole('heading', { name: updatedTask, exact: true }) });
        const capture = async (name: string) => {
            const path = testInfo.outputPath(`${viewport.name}-${name}.png`);
            await page.screenshot({ path, fullPage: true, animations: 'disabled' });
            await testInfo.attach(name, { path, contentType: 'image/png' });
        };
        const assertMobileTopbar = async () => {
            if (viewport.name !== 'mobile') return;
            const bar = page.locator('.origin-glass').filter({ has: page.getByRole('heading', { name: 'Organigrad', exact: true }) });
            const hint = page.getByRole('status').filter({ hasText: "Importez des fiches avant d'exporter." });
            const title = region.getByRole('heading', { name: 'Projets', exact: true });
            const buttons = ['Importer', 'Export CSV', 'Export PDF'].map(name => page.getByRole('button', { name, exact: true }));
            for (const element of [bar, hint, title, ...buttons]) await expect(element).toBeVisible();
            await expect.poll(async () => {
                const boxes = await Promise.all([bar, hint, title, ...buttons].map(element => element.boundingBox()));
                if (boxes.some(box => !box || box.width <= 0 || box.height <= 0)) return ['Missing visible geometry'];
                const [barBox, hintBox, titleBox, ...actions] = boxes.map(box => box!);
                const violations: string[] = [];
                const epsilon = 0.5; // Subpixel rounding only, never permit a text-height overlap.
                for (const [name, box] of [['Topbar', barBox], ['Import hint', hintBox], ...actions.map((box, i) => [buttons[i].toString(), box] as const)] as const) {
                    if (box.y + box.height > titleBox.y + epsilon) violations.push(`${name} bottom ${box.y + box.height} crosses Projects title top ${titleBox.y}`);
                }
                for (const [index, action] of actions.entries()) {
                    const horizontal = Math.min(action.x + action.width, hintBox.x + hintBox.width) - Math.max(action.x, hintBox.x);
                    const vertical = Math.min(action.y + action.height, hintBox.y + hintBox.height) - Math.max(action.y, hintBox.y);
                    if (horizontal > epsilon && vertical > epsilon) violations.push(`${buttons[index]} overlaps import hint (${horizontal}×${vertical}px)`);
                }
                for (const box of [hintBox, ...actions]) {
                    if (box.y < barBox.y - epsilon || box.y + box.height > barBox.y + barBox.height + epsilon) violations.push('Topbar content escapes its reserved vertical space');
                }
                return violations;
            }, { message: 'At 375px, topbar actions, import hint and Projects title must not overlap' }).toEqual([]);
        };
        const assertPersisted = async () => {
            await expect(region.getByRole('heading', { name: updatedProject, exact: true })).toBeVisible();
            await expect(taskCard.getByRole('heading', { name: updatedTask, exact: true })).toBeVisible();
            await expect(taskCard.getByText('Terminée', { exact: true })).toBeVisible();
            await expect(taskCard.locator('time')).toHaveAttribute('datetime', '2026-10-02');
            await expect(taskCard.locator('time')).toHaveText('02/10/2026');
            await expect(taskCard.getByText('TEST-SYNAPSE member', { exact: true })).toBeVisible();
        };

        await test.step('Start empty and use the real navigation and project form', async () => {
            expect(fixture.projects).toEqual([]);
            expect(fixture.tasks).toEqual([]);
            await page.goto('/');
            if (viewport.name === 'mobile') await page.getByRole('button', { name: 'Ouvrir le menu', exact: true }).click();
            await page.getByRole('navigation').getByRole('button', { name: 'Projets', exact: true }).click();
            await expect(region.getByText('Aucun projet pour le moment.', { exact: true })).toBeVisible();
            if (viewport.name === 'mobile') await capture('topbar-empty');
            await assertMobileTopbar();
            await region.getByRole('button', { name: 'Nouveau projet', exact: true }).click();
            await expect(dialog).toHaveAccessibleName('Nouveau projet');
            await expect(dialog.getByRole('button', { name: 'Créer le projet', exact: true })).toBeDisabled();
            await dialog.getByLabel('Nom', { exact: true }).fill(projectName);
            await dialog.getByLabel('Description', { exact: true }).fill('TEST-SYNAPSE description projet');
            await dialog.getByRole('button', { name: 'Créer le projet', exact: true }).click();
            await expect(dialog).toHaveCount(0);
            await expect(region.getByRole('heading', { name: projectName, exact: true })).toBeVisible();
            await expect(region.getByText('Aucune tâche pour le moment.', { exact: true })).toBeVisible();
            expect(fixture.projects).toHaveLength(1);
            expect(fixture.tasks).toEqual([]);
            await expect(page).toHaveURL(new RegExp(`project=${fixture.projects[0].id}`));
        });

        await test.step('Create a task using every actual form control', async () => {
            await region.getByRole('button', { name: 'Nouvelle tâche', exact: true }).click();
            await expect(dialog).toHaveAccessibleName('Nouvelle tâche');
            await expect(dialog.getByRole('button', { name: 'Créer la tâche', exact: true })).toBeDisabled();
            await dialog.getByLabel('Titre', { exact: true }).fill(taskName);
            await dialog.getByLabel('Description', { exact: true }).fill('TEST-SYNAPSE description tâche');
            await dialog.getByRole('combobox', { name: 'Statut', exact: true }).selectOption('running');
            await dialog.getByRole('combobox', { name: 'Responsable', exact: true }).selectOption({ label: 'TEST-SYNAPSE member' });
            await dialog.getByLabel('Échéance', { exact: true }).fill('2026-09-20');
            await capture('task-form');
            await dialog.getByRole('button', { name: 'Créer la tâche', exact: true }).click();
            await expect(dialog).toHaveCount(0);
            await expect(region.getByRole('heading', { name: taskName, exact: true })).toBeVisible();
            await expect(region.getByText('En cours', { exact: true })).toBeVisible();
            expect(fixture.tasks).toHaveLength(1);
            expect(fixture.tasks[0]).toMatchObject({ title: taskName, status: 'running', due_date: '2026-09-20', assignee_id: USER });
        });

        await test.step('Edit project name and task title/status/date, then reload HTTP fixture data', async () => {
            await region.getByRole('button', { name: 'Modifier le projet', exact: true }).click();
            await expect(dialog.getByLabel('Nom', { exact: true })).toHaveValue(projectName);
            await dialog.getByLabel('Nom', { exact: true }).fill(updatedProject);
            await dialog.getByRole('button', { name: 'Enregistrer le projet', exact: true }).click();
            await expect(dialog).toHaveCount(0);
            await expect(region.getByRole('heading', { name: updatedProject, exact: true })).toBeVisible();
            await region.getByRole('button', { name: `Modifier la tâche ${taskName}`, exact: true }).click();
            await expect(dialog.getByLabel('Échéance', { exact: true })).toHaveValue('2026-09-20');
            await dialog.getByLabel('Titre', { exact: true }).fill(updatedTask);
            await dialog.getByRole('combobox', { name: 'Statut', exact: true }).selectOption('done');
            await dialog.getByLabel('Échéance', { exact: true }).fill('2026-10-02');
            await dialog.getByRole('button', { name: 'Enregistrer la tâche', exact: true }).click();
            await expect(dialog).toHaveCount(0);
            await assertPersisted();
            const reads = fixture.requests.filter(request => request.startsWith('GET ')).length;
            await page.reload();
            await assertPersisted();
            expect(fixture.requests.filter(request => request.startsWith('GET ')).length).toBeGreaterThan(reads);
            expect(fixture.projects).toHaveLength(1);
            expect(fixture.tasks).toHaveLength(1);
            expect(fixture.projects[0]).toMatchObject({ name: updatedProject, version: 2 });
            expect(fixture.tasks[0]).toMatchObject({ title: updatedTask, status: 'done', due_date: '2026-10-02', version: 2 });
        });

        await test.step('Cancel and confirm task archive, then confirm restore', async () => {
            await region.getByRole('button', { name: `Archiver la tâche ${updatedTask}`, exact: true }).click();
            await expect(dialog).toHaveAccessibleName('Confirmer l’archivage');
            await expect(dialog).toContainText(updatedTask);
            expect(fixture.mutations).toHaveLength(4);
            await dialog.getByRole('button', { name: 'Annuler', exact: true }).click();
            await expect(dialog).toHaveCount(0);
            expect(fixture.mutations).toHaveLength(4);
            await expect(taskCard).toBeVisible();
            await region.getByRole('button', { name: `Archiver la tâche ${updatedTask}`, exact: true }).click();
            await dialog.getByRole('button', { name: 'Confirmer', exact: true }).click();
            await expect(dialog).toHaveCount(0);
            await expect(taskCard).toHaveCount(0);
            expect(fixture.tasks[0].archived_at).not.toBeNull();
            await region.getByLabel('Afficher les éléments archivés', { exact: true }).check();
            await expect(taskCard.getByText('Archivée', { exact: true })).toBeVisible();
            await taskCard.getByRole('button', { name: `Restaurer la tâche ${updatedTask}`, exact: true }).click();
            await expect(dialog).toHaveAccessibleName('Confirmer la restauration');
            await expect(dialog).toContainText(updatedTask);
            expect(fixture.mutations).toHaveLength(5);
            await dialog.getByRole('button', { name: 'Confirmer', exact: true }).click();
            await expect(dialog).toHaveCount(0);
            await expect(taskCard.getByText('Archivée', { exact: true })).toHaveCount(0);
            expect(fixture.tasks[0].archived_at).toBeNull();
            await region.getByLabel('Afficher les éléments archivés', { exact: true }).uncheck();
        });

        await test.step('Confirm project archive and readonly tasks, then restore', async () => {
            await region.getByRole('button', { name: 'Archiver le projet', exact: true }).click();
            await expect(dialog).toHaveAccessibleName('Confirmer l’archivage');
            await expect(dialog).toContainText(updatedProject);
            expect(fixture.mutations).toHaveLength(6);
            await dialog.getByRole('button', { name: 'Confirmer', exact: true }).click();
            await expect(dialog).toHaveCount(0);
            await expect(region.getByText('Projet archivé', { exact: true })).toBeVisible();
            await expect(region.getByRole('button', { name: 'Nouvelle tâche', exact: true })).toHaveCount(0);
            await expect(taskCard.getByRole('button')).toHaveCount(0);
            await expect(region.getByText('Aucun projet actif. Affichez les éléments archivés.', { exact: true })).toBeVisible();
            expect(fixture.projects[0].archived_at).not.toBeNull();
            await page.reload();
            await expect(region.getByText('Projet archivé', { exact: true })).toBeVisible();
            await expect(taskCard.getByRole('button')).toHaveCount(0);
            await region.getByLabel('Afficher les éléments archivés', { exact: true }).check();
            await expect(region.getByRole('button', { name: `${updatedProject} Archivé`, exact: true })).toBeVisible();
            await region.getByRole('button', { name: 'Restaurer le projet', exact: true }).click();
            await expect(dialog).toHaveAccessibleName('Confirmer la restauration');
            expect(fixture.mutations).toHaveLength(7);
            await dialog.getByRole('button', { name: 'Confirmer', exact: true }).click();
            await expect(dialog).toHaveCount(0);
            await expect(region.getByText('Projet archivé', { exact: true })).toHaveCount(0);
            await expect(region.getByRole('button', { name: 'Nouvelle tâche', exact: true })).toBeEnabled();
            expect(fixture.projects[0].archived_at).toBeNull();
            await page.reload();
            await assertPersisted();
            expect(fixture.mutations).toHaveLength(8);
            await capture('restored');
            await assertMobileTopbar();
        });

        await test.step('Synthetic viewer can read persisted records but has no mutation controls', async () => {
            fixture.role = 'viewer';
            await page.reload();
            await expect(region.getByText('Lecture seule — vous pouvez consulter les projets et leurs tâches.', { exact: true })).toBeVisible();
            await assertPersisted();
            await expect(region.getByRole('button', { name: /^(Nouveau projet|Nouvelle tâche|Modifier|Archiver|Restaurer)/ })).toHaveCount(0);
            await region.getByLabel('Afficher les éléments archivés', { exact: true }).check();
            await region.getByRole('button', { name: 'Actualiser', exact: true }).click();
            await expect(region.getByText('Lecture seule — vous pouvez consulter les projets et leurs tâches.', { exact: true })).toBeVisible();
            await assertPersisted();
            await expect(taskCard.getByRole('button')).toHaveCount(0);
            expect(fixture.mutations).toHaveLength(8);
            const bounds = await region.evaluate(element => ({ width: element.clientWidth, contentWidth: element.scrollWidth, pageWidth: document.documentElement.scrollWidth, viewport: innerWidth }));
            expect(bounds.contentWidth).toBeLessThanOrEqual(bounds.width + 1);
            expect(bounds.pageWidth).toBeLessThanOrEqual(bounds.viewport + 1);
            await capture('viewer');
            await assertMobileTopbar();
        });
    });
}
