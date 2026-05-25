import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';

interface ExportableViewRef {
    resetTransform: () => void;
}

export const exportToPdf = async (
    viewRef: React.RefObject<ExportableViewRef | null>,
    options?: {
        /** Nom de l'organisation (affiché en titre). Défaut : "Organigrad" */
        orgName?: string;
        /** Libellé du pôle / direction courant */
        poleLabel?: string;
    },
): Promise<void> => {
    return new Promise((resolve, reject) => {
        setTimeout(async () => {
            try {
                const element = document.getElementById('exportable-org-chart');
                if (!element) throw new Error('Chart container not found');

                if (viewRef.current) {
                    viewRef.current.resetTransform();
                }

                const canvas = await html2canvas(element, {
                    scale: 2,
                    useCORS: true,
                    logging: false,
                    backgroundColor: '#f8fafc',
                    windowWidth: element.scrollWidth,
                    windowHeight: element.scrollHeight,
                });

                const imgData = canvas.toDataURL('image/png');
                const pdf = new jsPDF({
                    orientation: 'landscape',
                    unit: 'mm',
                    format: 'a3',
                });

                const pdfWidth = pdf.internal.pageSize.getWidth();
                const pdfHeight = pdf.internal.pageSize.getHeight();

                const orgName = options?.orgName || 'Organigrad';
                const poleLabel = options?.poleLabel;
                const dateStr = new Date().toLocaleDateString('fr-FR');

                // Logo rond bleu
                pdf.setFillColor(37, 99, 235);
                pdf.roundedRect(10, 10, 25, 25, 6, 6, 'F');
                pdf.setFont('helvetica', 'bold');
                pdf.setFontSize(13);
                pdf.setTextColor(255, 255, 255);
                pdf.text(orgName.substring(0, 2).toUpperCase(), 22.5, 25.5, { align: 'center' });

                // Titre
                pdf.setFont('helvetica', 'bold');
                pdf.setFontSize(22);
                pdf.setTextColor(15, 23, 42);
                pdf.text(orgName.toUpperCase(), 40, 20);

                // Sous-titre
                pdf.setFont('helvetica', 'normal');
                pdf.setFontSize(12);
                pdf.setTextColor(100, 116, 139);
                const subtitle = poleLabel
                    ? `${poleLabel} · Organigramme · ${dateStr}`
                    : `Organigramme · ${dateStr}`;
                pdf.text(subtitle, 40, 28);

                const availableHeight = pdfHeight - 45;
                const imgRatio = canvas.width / canvas.height;
                let finalWidth = pdfWidth - 40;
                let finalHeight = finalWidth / imgRatio;

                if (finalHeight > availableHeight) {
                    finalHeight = availableHeight;
                    finalWidth = finalHeight * imgRatio;
                }

                const xOffset = (pdfWidth - finalWidth) / 2;
                const yOffset = 40 + (availableHeight - finalHeight) / 2;

                pdf.addImage(imgData, 'PNG', xOffset, yOffset, finalWidth, finalHeight);

                pdf.setFontSize(8);
                pdf.setTextColor(148, 163, 184);
                pdf.text('Document généré automatiquement par Organigrad · usage interne', pdfWidth / 2, pdfHeight - 10, { align: 'center' });

                const safeName = orgName.replace(/[^a-zA-Z0-9]/g, '-');
                const safePole = poleLabel ? `-${poleLabel.replace(/[^a-zA-Z0-9]/g, '-')}` : '';
                pdf.save(`Organigramme-${safeName}${safePole}-${dateStr}.pdf`);
                resolve();
            } catch (err) {
                console.error('[exportToPdf]', err);
                reject(err);
            }
        }, 800);
    });
};
