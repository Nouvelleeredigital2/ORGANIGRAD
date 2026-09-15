import { useState } from 'react';
import { Button, Surface } from '../../design/ui';
import type { CircuitOptions } from '../../types/circuit';
import type { BorealRecipeTemplateInput } from '../../services/orchestratorService';

const field = 'mt-1 w-full rounded-xl border border-[var(--hairline)] bg-[var(--surface)] px-3 py-2 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent)]';

export function BorealRecipeSetup({ options, onCreate }: {
    options: CircuitOptions;
    onCreate: (input: BorealRecipeTemplateInput) => Promise<unknown> | unknown;
}) {
    const [input, setInput] = useState<BorealRecipeTemplateInput>({ projectId: '', ericId: '', designId: '', engineId: '', guardianId: '', humanId: '' });
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const recipeProjects = options.projects.filter(project => project.name === 'TEST FICTIF — Atelier Boréal');
    const complete = recipeProjects.length === 1 && Object.values(input).every(Boolean);
    const change = (fieldName: keyof BorealRecipeTemplateInput) => (event: React.ChangeEvent<HTMLSelectElement>) =>
        setInput(previous => ({ ...previous, [fieldName]: event.target.value }));

    const submit = async () => {
        if (!complete || busy) return;
        setBusy(true); setError('');
        try { await onCreate(input); }
        catch { setError('Préparation impossible. Vérifiez le projet, les activations et les droits de chaque membre.'); }
        finally { setBusy(false); }
    };

    return <Surface className="p-5" aria-label="Préparer la recette Atelier Boréal">
        <h2 className="text-lg font-medium">TEST FICTIF — Atelier Boréal</h2>
        <p className="mt-1 text-sm text-[var(--fg-3)]">Prépare le parcours de recette connecté. Boréal Production restera séparé jusqu’à une recette validée. La programmation est désactivée ; le dossier se lance manuellement.</p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <label className="text-sm">Projet de recette<select className={field} aria-label="Projet de recette" value={input.projectId} onChange={change('projectId')}><option value="">Choisir un projet</option>{recipeProjects.map(project => <option key={project.ref.projectId} value={project.ref.projectId}>{project.name}</option>)}</select></label>
            <label className="text-sm">Validation humaine finale<select className={field} aria-label="Validation humaine finale" value={input.humanId} onChange={change('humanId')}><option value="">Choisir une personne</option>{options.humans.map(member => <option key={member.id} value={member.id}>{member.name}</option>)}</select></label>
            <Worker label="Éric — veille et rédaction" value={input.ericId} onChange={change('ericId')} workers={options.workers}/>
            <Worker label="Design — brief visuel" value={input.designId} onChange={change('designId')} workers={options.workers}/>
            <Worker label="Engine — génération" value={input.engineId} onChange={change('engineId')} workers={options.workers}/>
            <Worker label="Gardien de marque — contrôle" value={input.guardianId} onChange={change('guardianId')} workers={options.workers}/>
        </div>
        {error && <p role="alert" className="mt-3 text-sm text-red-700">{error}</p>}
        <Button className="mt-5" tone="blue" disabled={!complete || busy} onClick={() => void submit()}>{busy ? 'Préparation…' : 'Préparer la recette Atelier Boréal'}</Button>
    </Surface>;
}

function Worker({ label, value, onChange, workers }: { label: string; value: string; onChange: (event: React.ChangeEvent<HTMLSelectElement>) => void; workers: CircuitOptions['workers'] }) {
    return <label className="text-sm">{label}<select className={field} aria-label={label} value={value} onChange={onChange}><option value="">Choisir un membre</option>{workers.map(worker => <option key={worker.id} value={worker.id}>{worker.name}</option>)}</select></label>;
}
