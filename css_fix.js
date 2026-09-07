const fs = require('fs');
const file = 'frontend/src/app/vente/factures/factures.component.css';
const css = `
/* ==========================================================================
   Custom Invoice Detail Modal Styles
   ========================================================================== */

.detail-modal { max-width: 850px; background: #1e2436; border: 1px solid #334155; border-radius: 16px; overflow: hidden; }
.detail-header { background: linear-gradient(90deg, #161b27 0%, #1e2436 100%); padding: 24px 32px; border-bottom: 1px solid #334155; display: flex; justify-content: space-between; align-items: center; }
.header-left { display: flex; align-items: center; gap: 16px; }
.detail-icon { font-size: 32px; background: rgba(59, 130, 246, 0.15); padding: 12px; border-radius: 12px; color: #3b82f6; display: flex; align-items: center; justify-content: center; }
.detail-title-text { margin: 0 0 6px 0; font-size: 20px; font-weight: 700; color: #f8fafc; letter-spacing: -0.5px; }
.detail-ref-badge { background: #3b82f6; color: #fff; padding: 4px 10px; border-radius: 6px; font-size: 13px; font-family: monospace; font-weight: 600; letter-spacing: 0.5px; box-shadow: 0 2px 8px rgba(59, 130, 246, 0.3); }
.detail-body { padding: 32px; background-color: #121826; }
.detail-cards-row { display: flex; gap: 20px; margin-bottom: 32px; }
.detail-card { flex: 1; background: #1e2436; border: 1px solid #334155; border-radius: 12px; padding: 20px; display: flex; align-items: center; gap: 16px; transition: transform 0.2s, box-shadow 0.2s; }
.detail-card:hover { transform: translateY(-2px); box-shadow: 0 8px 24px rgba(0,0,0,0.2); border-color: #4da5ff; }
.detail-card-icon { font-size: 24px; background: rgba(255,255,255,0.05); width: 48px; height: 48px; border-radius: 10px; display: flex; align-items: center; justify-content: center; border: 1px solid rgba(255,255,255,0.1); }
.detail-card-content { display: flex; flex-direction: column; }
.detail-card-label { font-size: 13px; color: #8b949e; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 4px; font-weight: 600; }
.detail-card-value { font-size: 15px; color: #f8fafc; font-weight: 600; }
.detail-items-section { background: #1e2436; border: 1px solid #334155; border-radius: 12px; padding: 24px; margin-bottom: 32px; }
.detail-section-header { display: flex; align-items: center; gap: 10px; margin-bottom: 20px; border-bottom: 1px dashed #334155; padding-bottom: 16px; }
.detail-section-icon { font-size: 18px; }
.detail-section-title { margin: 0; font-size: 16px; font-weight: 700; color: #e2e8f0; text-transform: uppercase; letter-spacing: 0.5px; }
.detail-table-wrapper { overflow-x: auto; }
.detail-table { width: 100%; border-collapse: collapse; }
.detail-table th { background: #161b27; color: #8b949e; font-size: 12px; font-weight: 600; text-transform: uppercase; padding: 12px 16px; text-align: left; border-bottom: 2px solid #334155; }
.detail-table td { padding: 16px; border-bottom: 1px solid #2b334d; vertical-align: top; color: #e2e8f0; }
.detail-table tr:last-child td { border-bottom: none; }
.detail-table tr:hover td { background: #232a3d; }
.designation-cell { display: flex; flex-direction: column; gap: 4px; }
.designation-text { font-weight: 600; font-size: 15px; }
.barcode-sub { font-size: 12px; color: #8b949e; font-family: monospace; background: rgba(255,255,255,0.05); padding: 2px 6px; border-radius: 4px; display: inline-block; width: fit-content; }
.text-muted-detail { color: #64748b; font-size: 13px; }
.qty-cell { font-weight: 700; color: #38bdf8; background: rgba(56, 189, 248, 0.1); border-radius: 6px; }
.price-cell, .total-cell { font-family: monospace; }
.total-cell { font-weight: 700; color: #4ade80; }
.detail-financial-section { background: #1e2436; border: 1px solid #334155; border-radius: 12px; padding: 24px; }
.financial-grid { display: flex; flex-direction: column; gap: 12px; max-width: 400px; margin-left: auto; }
.financial-row { display: flex; justify-content: space-between; align-items: center; font-size: 15px; }
.financial-label { color: #8b949e; font-weight: 500; }
.financial-value { color: #e2e8f0; font-weight: 600; font-family: monospace; }
.financial-divider { height: 1px; background: #334155; margin: 8px 0; }
.tva-value { color: #f59e0b; }
.remise-value { color: #ec4899; }
.paid-value { color: #3b82f6; }
.reste-value { color: #ef4444; font-weight: 700; }
.net-row { background: #0f172a; padding: 12px 16px; border-radius: 8px; border: 1px solid #1e293b; margin: 4px 0; }
.net-label { font-size: 16px; color: #f8fafc; font-weight: 700; }
.net-value { font-size: 20px; color: #10b981; font-weight: 800; }
.detail-footer { padding: 20px 32px; background: #161b27; border-top: 1px solid #334155; display: flex; justify-content: flex-end; }
`;
fs.appendFileSync(file, '\n' + css);
