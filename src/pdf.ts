import PDFDocument from 'pdfkit';
import { TITULOS } from './db';
import { fechaDia } from './util';

const AZUL = '#15324B';
const DORADO = '#B99A60';
const LEYENDA = 'Documento de carácter informativo emitido desde el Portal de Autogestión. Su validez como certificado oficial está sujeta a la aprobación de la Departamental Río Grande.';

function aRespuesta(doc: any, nombre: string): Promise<Response> {
  return new Promise((resolve, reject) => {
    const partes: Buffer[] = [];
    doc.on('data', (b: Buffer) => partes.push(b));
    doc.on('end', () => resolve(new Response(Buffer.concat(partes), {
      headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': `attachment; filename="${nombre}"`, 'Cache-Control': 'no-store' },
    })));
    doc.on('error', reject);
    doc.end();
  });
}

export function certificadoPdf(m: any, base: string) {
  const hoy = new Date().toLocaleDateString('es-AR', { timeZone: 'America/Argentina/Ushuaia', day: 'numeric', month: 'long', year: 'numeric' });
  const doc = new PDFDocument({ size: 'A4', margin: 64, info: { Title: `Constancia de matrícula ${m.matricula}` } });
  doc.rect(36, 36, 523, 770).lineWidth(1.5).stroke(AZUL);
  doc.rect(36, 36, 523, 6).fill(DORADO);
  doc.moveDown(1.5).fillColor(AZUL).font('Helvetica-Bold').fontSize(13)
    .text('COLEGIO DE MARTILLEROS Y CORREDORES PÚBLICOS DE TIERRA DEL FUEGO, ANTÁRTIDA E ISLAS DEL ATLÁNTICO SUR', { align: 'center' });
  doc.moveDown(0.4).fillColor(DORADO).fontSize(11).text('DEPARTAMENTAL RÍO GRANDE', { align: 'center', characterSpacing: 1.5 });
  doc.moveDown(3).fillColor('#000').fontSize(18).text('CONSTANCIA DE MATRÍCULA', { align: 'center' });
  const titulo = TITULOS[m.titulo] ? `, con título de ${TITULOS[m.titulo]}` : '';
  doc.moveDown(2).font('Helvetica').fontSize(12).fillColor('#35424C').text(
    `Se deja constancia de que ${m.nombre} ${m.apellido}, DNI ${m.dni}, se encuentra inscripto/a en los registros de la Departamental Río Grande ` +
    `bajo la matrícula N.º ${m.matricula}${titulo}, con fecha de alta ${fechaDia(m.fecha_alta)}, y que a la fecha su matrícula figura como ACTIVA.`,
    { align: 'justify', lineGap: 5 });
  doc.moveDown(1.2).text(`Domicilio profesional declarado: ${m.domicilio_profesional || '—'}, Río Grande.`, { lineGap: 5 });
  doc.moveDown(1.2).text(`Emitida a pedido del/la interesado/a el ${hoy}.`, { lineGap: 5 });
  doc.moveDown(3).font('Helvetica').fontSize(10).fillColor('#555')
    .text(`Verificá la matrícula en el padrón público: ${base}/matriculados`, { align: 'center' });
  const y = 690;
  doc.rect(64, y, 467, 70).lineWidth(1).stroke(DORADO);
  doc.fontSize(9.5).fillColor('#35424C').text(LEYENDA, 78, y + 16, { width: 439, align: 'center', lineGap: 3 });
  return aRespuesta(doc, `constancia-matricula-${m.matricula}.pdf`);
}

export function credencialPdf(m: any) {
  const doc = new PDFDocument({ size: [340, 215], margin: 0, info: { Title: `Credencial ${m.matricula}` } });
  doc.rect(0, 0, 340, 215).fill(AZUL);
  doc.rect(0, 0, 340, 5).fill(DORADO);
  doc.fillColor('#fff').font('Helvetica-Bold').fontSize(8.5).text('COLEGIO DE MARTILLEROS Y CORREDORES PÚBLICOS', 20, 18);
  doc.fillColor(DORADO).font('Helvetica-Bold').fontSize(7.5).text('TIERRA DEL FUEGO · DEPARTAMENTAL RÍO GRANDE', 20, 30, { characterSpacing: 0.6 });
  doc.fillColor('#fff').font('Helvetica-Bold').fontSize(15).text(`${m.apellido.toUpperCase()}, ${m.nombre}`, 20, 58, { width: 300 });
  doc.font('Helvetica').fontSize(9.5).text(`DNI ${m.dni}`, 20, 86);
  if (TITULOS[m.titulo]) doc.text(TITULOS[m.titulo], 20, 100);
  doc.rect(0, 140, 340, 75).fill('#F8F7F3');
  doc.fillColor(AZUL).font('Helvetica-Bold').fontSize(12).text(`MATRÍCULA N.º ${m.matricula}`, 20, 152);
  doc.font('Helvetica').fontSize(7).fillColor('#35424C')
    .text(`Emitida el ${new Date().toLocaleDateString('es-AR')} · Credencial informativa. Verificá la vigencia en el padrón público de la Departamental.`, 20, 172, { width: 300, lineGap: 2 });
  return aRespuesta(doc, `credencial-${m.matricula}.pdf`);
}
