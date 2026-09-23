import { useState, useRef } from 'react';
import { toast } from 'react-toastify';
import * as XLSX from 'xlsx';
import { FiX, FiUploadCloud, FiDownload, FiCheck, FiAlertTriangle, FiFileText } from 'react-icons/fi';
import api from '../utils/api';
import { useCountry } from '../context/CountryContext';

/**
 * Spreadsheet upload for stock levels.
 *
 * The file is read in the browser and sent to the server as plain rows, which
 * re-validates everything and previews the result. Nothing is written until
 * every row is clean and the user confirms.
 */

// Header spellings accepted for each field, lower-cased and stripped of spaces
const COLUMN_ALIASES = {
    sku: ['sku', 'productsku', 'code', 'productcode', 'itemcode'],
    warehouse: ['warehouse', 'warehousename', 'store', 'location'],
    cartons: ['cartons', 'carton', 'cartonqty', 'cartonquantity', 'cases'],
    pieces: ['pieces', 'piece', 'pcs', 'units', 'quantity', 'qty'],
};

const MODES = [
    { key: 'SET', label: 'Stock count', hint: 'Quantity becomes exactly the number in the sheet' },
    { key: 'IN', label: 'Add stock', hint: 'Quantity is added to what is already there' },
    { key: 'OUT', label: 'Remove stock', hint: 'Quantity is taken off what is already there' },
];

const normHeader = (h) => String(h ?? '').trim().toLowerCase().replace(/[\s_-]/g, '');

/** Maps a sheet's header row onto our field names. */
const buildColumnMap = (headers) => {
    const map = {};
    headers.forEach((header, index) => {
        const key = normHeader(header);
        for (const [field, aliases] of Object.entries(COLUMN_ALIASES)) {
            if (aliases.includes(key) && map[field] === undefined) map[field] = index;
        }
    });
    return map;
};

const BulkInventoryUploadModal = ({ isOpen, onClose, onSuccess }) => {
    const { activeCountry } = useCountry();
    const fileInputRef = useRef(null);

    const [fileName, setFileName] = useState('');
    const [mode, setMode] = useState('SET');
    const [reason, setReason] = useState('');
    const [parsing, setParsing] = useState(false);
    const [importing, setImporting] = useState(false);
    // preview: { valid, errors[], rows[], counts }
    const [preview, setPreview] = useState(null);
    const [parseError, setParseError] = useState('');
    const [rawRows, setRawRows] = useState([]);

    const reset = () => {
        setFileName('');
        setPreview(null);
        setParseError('');
        setRawRows([]);
        setReason('');
        if (fileInputRef.current) fileInputRef.current.value = '';
    };

    const handleClose = () => { reset(); onClose(); };

    /** Reads the workbook and asks the server to validate the rows. */
    const handleFile = async (file, forMode = mode) => {
        if (!file) return;
        setParsing(true);
        setParseError('');
        setPreview(null);
        setFileName(file.name);

        try {
            const buffer = await file.arrayBuffer();
            const workbook = XLSX.read(buffer, { type: 'array' });
            const sheet = workbook.Sheets[workbook.SheetNames[0]];
            if (!sheet) throw new Error('The file has no sheets');

            // header:1 gives raw rows so we can find the header ourselves
            const grid = XLSX.utils.sheet_to_json(sheet, { header: 1, blankrows: false, defval: '' });
            if (grid.length < 2) throw new Error('The sheet needs a header row and at least one data row');

            const columns = buildColumnMap(grid[0]);
            if (columns.sku === undefined || columns.warehouse === undefined) {
                throw new Error('The sheet needs a "SKU" column and a "Warehouse" column');
            }
            if (columns.cartons === undefined && columns.pieces === undefined) {
                throw new Error('The sheet needs a "Cartons" column, a "Pieces" column, or both');
            }

            const rows = grid.slice(1)
                .map((r) => ({
                    sku: r[columns.sku],
                    warehouse: r[columns.warehouse],
                    cartons: columns.cartons === undefined ? '' : r[columns.cartons],
                    pieces: columns.pieces === undefined ? '' : r[columns.pieces],
                }))
                // Drop rows that are entirely blank — trailing rows are common
                .filter((r) => String(r.sku ?? '').trim() || String(r.warehouse ?? '').trim());

            if (rows.length === 0) throw new Error('No data rows found under the header');

            setRawRows(rows);
            await runPreview(rows, forMode);
        } catch (err) {
            setParseError(err.message || 'Could not read that file');
            setRawRows([]);
        } finally {
            setParsing(false);
        }
    };

    const runPreview = async (rows, forMode) => {
        try {
            const res = await api.post('/inventory/bulk-adjust/preview', {
                mode: forMode,
                rows,
                ...(activeCountry?._id && { countryId: activeCountry._id }),
            });
            setPreview(res.data.data);
        } catch (err) {
            setParseError(err.response?.data?.message || 'Could not check that file');
        }
    };

    // Switching mode re-checks the same rows — OUT can fail where SET passed
    const handleModeChange = async (next) => {
        setMode(next);
        if (rawRows.length > 0) {
            setParsing(true);
            await runPreview(rawRows, next);
            setParsing(false);
        }
    };

    const handleImport = async () => {
        if (!preview?.valid) return;
        if (!reason.trim()) {
            toast.error('Enter a reason for this upload');
            return;
        }

        setImporting(true);
        try {
            const res = await api.post('/inventory/bulk-adjust', {
                mode,
                reason: reason.trim(),
                rows: rawRows,
                ...(activeCountry?._id && { countryId: activeCountry._id }),
            });
            const { applied, unchanged } = res.data.data;
            toast.success(
                `${applied} row${applied === 1 ? '' : 's'} imported` +
                (unchanged > 0 ? ` (${unchanged} already at that level)` : '')
            );
            reset();
            onSuccess();
            onClose();
        } catch (err) {
            const data = err.response?.data;
            if (data?.errors?.length) {
                // The sheet passed preview but the stock moved underneath it
                setPreview((p) => ({ ...(p || {}), valid: false, errors: data.errors }));
                toast.error(data.message || 'Import rejected — nothing was changed');
            } else {
                toast.error(data?.message || 'Import failed');
            }
        } finally {
            setImporting(false);
        }
    };

    /** Builds a starter workbook using this country's real warehouses. */
    const handleTemplate = async () => {
        try {
            const [whRes, prodRes] = await Promise.all([
                api.get('/warehouses'),
                api.get('/products?limit=5&includeUnpriced=true'),
            ]);
            const warehouse = whRes.data.data?.[0]?.name || 'Main Warehouse';
            const products = prodRes.data.data || [];

            const rows = products.length > 0
                ? products.map((p) => ({ SKU: p.sku, Warehouse: warehouse, Cartons: 0, Pieces: 0 }))
                : [{ SKU: 'EXAMPLE-SKU', Warehouse: warehouse, Cartons: 0, Pieces: 0 }];

            const sheet = XLSX.utils.json_to_sheet(rows, { header: ['SKU', 'Warehouse', 'Cartons', 'Pieces'] });
            sheet['!cols'] = [{ wch: 20 }, { wch: 22 }, { wch: 10 }, { wch: 10 }];

            const book = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(book, sheet, 'Stock');
            XLSX.writeFile(book, 'stock-upload-template.xlsx');
            toast.success('Template downloaded');
        } catch {
            toast.error('Could not build the template');
        }
    };

    if (!isOpen) return null;

    const errors = preview?.errors || [];
    const rows = preview?.rows || [];
    const canImport = preview?.valid && rows.length > 0 && reason.trim() && !importing;
    const activeMode = MODES.find((m) => m.key === mode);

    return (
        <div className="modal-overlay">
            <div className="modal-content" style={{ maxWidth: '900px', width: '95%' }}>
                <div className="modal-header">
                    <h2>Upload Stock from a Sheet</h2>
                    <button onClick={handleClose} className="btn-close" title="Close"><FiX /></button>
                </div>

                {/* 1. What the file should do */}
                <div className="form-group">
                    <label>What should this sheet do?</label>
                    <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                        {MODES.map((m) => (
                            <button
                                key={m.key}
                                type="button"
                                onClick={() => handleModeChange(m.key)}
                                title={m.hint}
                                style={{
                                    padding: '0.45rem 0.95rem', borderRadius: '8px', fontSize: '0.85rem',
                                    cursor: 'pointer',
                                    fontWeight: mode === m.key ? 700 : 500,
                                    border: `1px solid ${mode === m.key ? '#4880FF' : '#E2E8F0'}`,
                                    background: mode === m.key ? '#EFF6FF' : '#fff',
                                    color: mode === m.key ? '#1D4ED8' : '#64748B',
                                }}
                            >
                                {m.label}
                            </button>
                        ))}
                    </div>
                    <small style={{ color: '#64748B' }}>{activeMode?.hint}</small>
                </div>

                {/* 2. The file */}
                <div className="form-group">
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
                        <label style={{ margin: 0 }}>Spreadsheet</label>
                        <button type="button" onClick={handleTemplate} className="btn btn-secondary"
                            style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.8rem', padding: '0.35rem 0.75rem' }}>
                            <FiDownload size={13} /> Download template
                        </button>
                    </div>

                    <div
                        onClick={() => fileInputRef.current?.click()}
                        onDragOver={(e) => e.preventDefault()}
                        onDrop={(e) => { e.preventDefault(); handleFile(e.dataTransfer.files?.[0]); }}
                        style={{
                            border: '2px dashed #CBD5E1', borderRadius: '10px', padding: '1.5rem',
                            textAlign: 'center', cursor: 'pointer', background: '#F8FAFC',
                        }}
                    >
                        <FiUploadCloud size={26} style={{ color: '#94A3B8' }} />
                        <div style={{ marginTop: '0.5rem', fontSize: '0.9rem', color: '#475569', fontWeight: 600 }}>
                            {fileName || 'Click to choose a file, or drop it here'}
                        </div>
                        <div style={{ fontSize: '0.78rem', color: '#94A3B8', marginTop: '0.25rem' }}>
                            .xlsx, .xls or .csv — columns: SKU, Warehouse, Cartons, Pieces
                        </div>
                    </div>
                    <input
                        ref={fileInputRef}
                        type="file"
                        accept=".xlsx,.xls,.csv"
                        onChange={(e) => handleFile(e.target.files?.[0])}
                        style={{ display: 'none' }}
                    />
                </div>

                {parsing && (
                    <div style={{ padding: '0.75rem', color: '#64748B', fontSize: '0.88rem' }}>Checking the sheet…</div>
                )}

                {parseError && (
                    <div style={{ background: '#FEE2E2', border: '1px solid #FECACA', color: '#991B1B', borderRadius: '8px', padding: '0.75rem 1rem', fontSize: '0.87rem', display: 'flex', gap: '0.5rem', alignItems: 'flex-start' }}>
                        <FiAlertTriangle style={{ flexShrink: 0, marginTop: '2px' }} /> <span>{parseError}</span>
                    </div>
                )}

                {/* 3. Problems, if any */}
                {errors.length > 0 && (
                    <div style={{ marginTop: '0.5rem' }}>
                        <div style={{ fontSize: '0.85rem', fontWeight: 700, color: '#991B1B', marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                            <FiAlertTriangle size={14} />
                            {errors.length} row{errors.length === 1 ? '' : 's'} need fixing — nothing will be imported until they are
                        </div>
                        <div className="table-container" style={{ maxHeight: '180px', overflowY: 'auto' }}>
                            <table className="data-table" style={{ fontSize: '0.82rem' }}>
                                <thead>
                                    <tr><th style={{ width: '60px' }}>Row</th><th>SKU</th><th>Warehouse</th><th>Problem</th></tr>
                                </thead>
                                <tbody>
                                    {errors.map((e, i) => (
                                        <tr key={i} style={{ background: '#FEF2F2' }}>
                                            <td style={{ fontWeight: 600 }}>{e.row || '—'}</td>
                                            <td>{e.sku || '—'}</td>
                                            <td>{e.warehouse || '—'}</td>
                                            <td style={{ color: '#991B1B' }}>{e.message}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}

                {/* 4. What will happen */}
                {rows.length > 0 && errors.length === 0 && (
                    <div style={{ marginTop: '0.5rem' }}>
                        <div style={{ fontSize: '0.85rem', fontWeight: 700, color: '#065F46', marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                            <FiFileText size={14} /> {rows.length} row{rows.length === 1 ? '' : 's'} ready
                        </div>
                        <div className="table-container" style={{ maxHeight: '260px', overflowY: 'auto' }}>
                            <table className="data-table" style={{ fontSize: '0.82rem' }}>
                                <thead>
                                    <tr>
                                        <th>SKU</th>
                                        <th>Product</th>
                                        <th>Warehouse</th>
                                        <th style={{ textAlign: 'right' }}>Now</th>
                                        <th style={{ textAlign: 'right' }}>Change</th>
                                        <th style={{ textAlign: 'right' }}>After</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {rows.map((r) => (
                                        <tr key={r.row} style={{ background: r.change === 0 ? '#F8FAFC' : undefined }}>
                                            <td className="font-mono text-xs">{r.sku}</td>
                                            <td>{r.productName}</td>
                                            <td style={{ color: '#64748B' }}>{r.warehouseName}</td>
                                            <td style={{ textAlign: 'right', color: '#64748B' }}>{r.currentQuantity.toLocaleString()}</td>
                                            <td style={{ textAlign: 'right', fontWeight: 700, color: r.change > 0 ? '#10B981' : r.change < 0 ? '#DC2626' : '#94A3B8' }}>
                                                {r.change === 0 ? '—' : `${r.change > 0 ? '+' : ''}${r.change.toLocaleString()}`}
                                            </td>
                                            <td style={{ textAlign: 'right', fontWeight: 700 }}>{r.newQuantity.toLocaleString()}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}

                {/* 5. Reason, required for the ledger */}
                {rows.length > 0 && errors.length === 0 && (
                    <div className="form-group" style={{ marginTop: '1rem' }}>
                        <label>Reason <span style={{ color: '#DC2626' }}>*</span></label>
                        <input
                            type="text"
                            value={reason}
                            onChange={(e) => setReason(e.target.value)}
                            placeholder="e.g. September stock count"
                        />
                        <small style={{ color: '#64748B' }}>Recorded against every ledger entry this upload creates.</small>
                    </div>
                )}

                <div className="modal-actions">
                    <button onClick={handleClose} className="btn btn-secondary" disabled={importing}>Cancel</button>
                    <button
                        onClick={handleImport}
                        className="btn btn-primary"
                        disabled={!canImport}
                        style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}
                    >
                        <FiCheck size={14} />
                        {importing ? 'Importing…' : `Import ${rows.length || ''} row${rows.length === 1 ? '' : 's'}`.trim()}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default BulkInventoryUploadModal;
