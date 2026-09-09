import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { parse } from 'postcss';
import stylesheet from '../../index.css?raw';
import { Topbar } from './Topbar';
import { OriginProvider } from '../../origin';

const mobileStyles = document.createElement('style');
const lateUtilities = document.createElement('style');
afterEach(() => { mobileStyles.remove(); lateUtilities.remove(); });

function renderTopbar(canExport = false, handleImportFile = vi.fn(async () => {})) {
    const handleExportCSV = vi.fn();
    const handleExportPDF = vi.fn();
    const rendered = render(<Topbar handleExportCSV={handleExportCSV} handleExportPDF={handleExportPDF}
        handleImportFile={handleImportFile} canExport={canExport} loading={false} isExporting={false}
        spotlightInput={<input aria-label="Rechercher" />} />, { wrapper: OriginProvider });
    return { ...rendered, handleExportCSV, handleExportPDF };
}

// jsdom has no viewport layout engine. Apply only the real CSS rules whose
// max-width breakpoint includes 375px; Bohr verifies bounding boxes in Chromium.
function applyMobileRules() {
    const rules: string[] = [];
    parse(stylesheet).walkAtRules('media', media => {
        const maxWidth = /max-width:\s*(\d+)px/.exec(media.params);
        if (maxWidth && 375 <= Number(maxWidth[1])) media.walkRules(rule => {
            if (rule.selector.includes('.organigrad-topbar')) rules.push(rule.toString());
        });
    });
    mobileStyles.textContent = rules.join('\n');
    document.head.append(mobileStyles);
}

describe('Topbar mobile flow', () => {
    it('keeps mobile layout when origin-system re-emits the competing Tailwind utilities afterwards', () => {
        const { container } = renderTopbar();
        applyMobileRules();
        // These exact declarations were observed after index.css in Chromium's
        // origin-system.css stylesheet. Keep the actual application load order.
        lateUtilities.textContent = '.h-24 { height: 6rem; } .absolute { position: absolute; } .px-8 { padding-left: 2rem; padding-right: 2rem; } .px-12 { padding-left: 3rem; padding-right: 3rem; }';
        document.head.append(lateUtilities);
        expect(getComputedStyle(container.firstElementChild!).height).toBe('auto');
        expect(getComputedStyle(container.firstElementChild!).paddingLeft).toBe('16px');
        expect(getComputedStyle(screen.getByRole('status')).position).toBe('static');
        expect(getComputedStyle(screen.getByRole('textbox', { name: 'Rechercher' }).parentElement!).paddingLeft).toBe('0px');
    });
    it('reserves natural header height and keeps the export hint inside its action flow', () => {
        const { container } = renderTopbar();
        applyMobileRules();
        const header = container.firstElementChild!;
        expect(getComputedStyle(header).height).toBe('auto');
        expect(getComputedStyle(header).flexShrink).toBe('0');
        expect(getComputedStyle(screen.getByRole('status')).position).toBe('static');
        expect(getComputedStyle(screen.getByRole('button', { name: 'Importer' }).parentElement!).flexWrap).toBe('wrap');
        expect(screen.getByRole('button', { name: 'Export CSV' })).toBeDisabled();
        expect(screen.getByRole('button', { name: 'Export PDF' })).toBeDisabled();
    });
    it('keeps import errors in the same reserved flow', async () => {
        const { container } = renderTopbar(false, vi.fn(async () => { throw new Error('Import refusé'); }));
        applyMobileRules();
        fireEvent.change(container.querySelector('input[type=file]')!, { target: { files: [new File(['test'], 'test.csv', { type: 'text/csv' })] } });
        const error = await screen.findByRole('alert');
        expect(error).toHaveTextContent('Import refusé');
        expect(getComputedStyle(error).position).toBe('static');
    });
    it('preserves both export callbacks and the file picker', () => {
        const { container, handleExportCSV, handleExportPDF } = renderTopbar(true);
        const pick = vi.spyOn(container.querySelector('input[type=file]') as HTMLInputElement, 'click');
        fireEvent.click(screen.getByRole('button', { name: 'Importer' }));
        fireEvent.click(screen.getByRole('button', { name: 'Export CSV' }));
        fireEvent.click(screen.getByRole('button', { name: 'Export PDF' }));
        expect(pick).toHaveBeenCalledTimes(1);
        expect(handleExportCSV).toHaveBeenCalledTimes(1);
        expect(handleExportPDF).toHaveBeenCalledTimes(1);
        expect(screen.queryByRole('status')).not.toBeInTheDocument();
    });
    it('keeps every new layout override below the desktop breakpoint', () => {
        let count = 0;
        parse(stylesheet).walkRules(rule => {
            if (!rule.selector.includes('.organigrad-topbar')) return;
            count++;
            expect(rule.parent?.type).toBe('atrule');
            expect(rule.parent && 'params' in rule.parent ? rule.parent.params : '').toBe('(max-width: 1023px)');
        });
        expect(count).toBeGreaterThan(0);
    });
});
