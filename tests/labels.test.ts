import { describe, expect, it } from 'vitest';
import { cleanLabel, short } from '../src/data/labels';

describe('cleanLabel', () => {
  it.each([
    ['************1234 MERCADONA PARQUE AZALEA( MALAGA ES PAGO CON TARJETA EN SUPERMERCADOS', 'Mercadona Parque Azalea'],
    ['GORILA DIGITAL SL TRANSFERENCIAS GORILA DIGITAL S.L. GORILA DIGITAL SL', 'Gorila Digital'],
    ['N 1234567890123456 PayPal Europe S.a.r.l. et Cie S.C.A ADEUDO A SU CARGO', 'PayPal Europe'],
    ['N 9876543210987654 VOLKSWAGEN RENTING S.A. ADEUDO DE LEASING / RENTING', 'Volkswagen Renting'],
    ['BIZUM ENVIADO A MARIA LOPEZ Cena', 'Maria Lopez Cena'],
    ['AEAT MODELO 303 3T 2026 ADEUDO A SU CARGO', 'AEAT Modelo 303 3T 2026'],
    ['TRANSFERENCIA ES91 2100 0418 4502 0005 1332 ALQUILER OFICINA', 'Alquiler Oficina'],
    ['Cobro Hotel Mirador', 'Cobro Hotel Mirador'],
    // Patterns seen in real Spanish bank statements (made-up names and numbers).
    ['NOMINA AGOSTO 2026 PAGO DE NOMINAS POR SU CUENTA EJEMPLO S.L. ***************************', 'Nómina Agosto'],
    ['NRC. 1234567890123ABCD45EF CARGO POR PAGO DE IMPUESTOS - TRIBUTOS', 'Pago de impuestos'],
    ['N 1234567890 TGSS. COTIZACION 092026 R.E.AUTONOMOS ADEUDO DE CUOTA DE LA SEGURIDAD SOCIAL', 'Cuota de autónomos'],
    ['/INV/F260006 1.6.2026/INV/F260006 TRANSFERENCIAS', 'Factura F260006'],
    ['1234 LINK.COM* HIGGSFIELD I PAGO CON TARJETA DE COMPRAS A DISTANCIA Y SUSCRIPCIONES', 'Higgsfield'],
    ['5678 Analogue Enterprises COMPRA EN COMERCIO EXTRANJERO-COMISION 3 % INCLUIDA', 'Analogue Enterprises'],
    ['N 1234567890 OGSP Interim Services, SL ADEUDO A SU CARGO', 'OGSP Interim Services'],
    ['EJEMPLO SL TRANSFERENCIAS', 'Ejemplo'],
    ['Traspaso a mi cuenta TRANSFERENCIAS', 'Traspaso a mi cuenta'],
    ['LIQ. OP. NO 12345678 PRESTAMO', 'Prestamo'],
  ])('%s → %s', (raw, expected) => expect(cleanLabel(raw)).toBe(expected));

  it('never returns more than the limit and keeps something for odd input', () => {
    expect(cleanLabel('X'.repeat(200)).length).toBeLessThanOrEqual(26);
    // Pure boilerplate falls back to the original text rather than an empty label.
    expect(cleanLabel('ADEUDO A SU CARGO')).not.toBe('');
    expect(cleanLabel('')).toBe('');
    expect(cleanLabel(null)).toBe('');
  });

  it('shortens at a word boundary with an ellipsis', () => {
    expect(short('Restaurante El Rincón de la Abuela', 20)).toBe('Restaurante El…');
    expect(short('Corto', 20)).toBe('Corto');
  });
});
