import { useState, useEffect, useCallback } from 'react';
import { FiFilter, FiX, FiDownload, FiArrowUp, FiArrowDown, FiRefreshCw } from 'react-icons/fi';
import api from '../utils/api';
import Spinner from '../components/Spinner';
import ExportButton from '../components/ExportButton';
import { useCountry } from '../context/CountryContext';
import useCurrency from '../hooks/useCurrency';

const TYPE_META = {
    IN:           { label: 'Stock In',       color: '#10B981', bg: '#D1FAE5' },
    OUT:          { label: 'Order Out',       color: '#EF4444', bg: '#FEE2E2' },
    ADJUSTMENT:   { label: 'Correction',      color: '#F59E0B', bg: '#FEF3C7' },
    TRANSFER_IN:  { label: 'Transfer In',     color: '#6366F1', bg: '#EDE9FE' },
    TRANSFER_OUT: { label: 'Transfer Out',    color: '#8B5CF6', bg: '#EDE9FE' },
};

const fmtDate = (d) =>
    d ? new Date(d).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';

const StatCard = ({ label, value, sub, color }) => (
    <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: '10px', padding: '1rem 1.25rem', boxShadow: '0 1px 3px rgba(0,0,0,.05)' }}>
        <div style={{ fontSize: '0.75rem', color: '#64748B', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '0.35rem' }}>{label}</div>
        <div style={{ fontSize: '1.4rem', fontWeight: 800, color: color || '#1E293B', lineHeight: 1 }}>{value}</div>
        {sub && <div style={{ fontSize: '0.78rem', color: '#94A3B8', marginTop: '0.25rem' }}>{sub}</div>}
    </div>
);

const InventoryHistory = () => {
    const { activeCountry } = useCountry();
    const { format, symbol } = useCurrency();
    const fmt = (n) => format(Number(n || 0));
    const [entries, setEntries] = useState([]);
    const [loading, setLoading] = useState(true);
    const [warehouses, setWarehouses] = useState([]);
    const [products, setProducts] = useState([]);

    // Filters
    const [filterWarehouse, setFilterWarehouse] = useState('');
    const [filterProduct, setFilterProduct] = useState('');
    const [filterType, setFilterType] = useState('');
    const [filterSearch, setFilterSearch] = useState('');
    const [dateRange, setDateRange] = useState({ startDate: '', endDate: '' });

    // Pagination
    const [page, setPage] = useState(1);
    const [pages, setPages] = useState(1);
    const [total, setTotal] = useState(0);
    const LIMIT = 50;

    // Stats derived from current page
    const [stats, setStats] = useState({ totalIn: 0, totalOut: 0, netChange: 0, valueChange: 0 });

    useEffect(() => {
        if (!activeCountry?._id) return;
        const countryParam = `?countryId=${activeCountry._id}`;
        Promise.all([api.get(`/warehouses${countryParam}`), api.get(`/products?limit=1000&countryId=${activeCountry._id}&includeUnpriced=true`)])
            .then(([wh, pr]) => {
                setWarehouses(wh.data.data || []);
                setProducts((pr.data.data || []).filter(p => p.status === 'ACTIVE'));
            }).catch(() => {});
    }, [activeCountry?._id]);

    const fetchLedger = useCallback(async (pg = 1) => {
        if (!activeCountry?._id) return;
        setLoading(true);
        try {
            const params = new URLSearchParams({ page: pg, limit: LIMIT });
            if (filterWarehouse) params.append('warehouseId', filterWarehouse);
            if (filterProduct) params.append('productId', filterProduct);
            if (filterType) params.append('type', filterType);
            if (filterSearch.trim()) params.append('search', filterSearch.trim());
            if (dateRange.startDate) params.append('startDate', dateRange.startDate);
            if (dateRange.endDate) params.append('endDate', dateRange.endDate);
            params.append('countryId', activeCountry._id);

            const res = await api.get(`/inventory/ledger?${params}`);
            const data = res.data.data || [];
            setEntries(data);
            setTotal(res.data.total || 0);
            setPages(res.data.pages || 1);
            setPage(pg);

            // Compute stats from returned entries
            let totalIn = 0, totalOut = 0, valueChange = 0;
            data.forEach(e => {
                if (e.change > 0) totalIn += e.change;
                else totalOut += Math.abs(e.change);
                valueChange += (e.valueAfter || 0);
            });
            setStats({ totalIn, totalOut, netChange: totalIn - totalOut, valueChange });
        } catch {
            // silent
        } finally {
            setLoading(false);
        }
    }, [filterWarehouse, filterProduct, filterType, filterSearch, dateRange, activeCountry?._id]);

    useEffect(() => { fetchLedger(1); }, [fetchLedger]);

    const handleClear = () => {
        setFilterWarehouse('');
        setFilterProduct('');
        setFilterType('');
        setFilterSearch('');
        setDateRange({ startDate: '', endDate: '' });
    };

    const hasFilters = filterWarehouse || filterProduct || filterType || filterSearch || dateRange.startDate || dateRange.endDate;

    const getExportData = () => entries.map(e => ({
        date: fmtDate(e.createdAt),
        type: TYPE_META[e.type]?.label || e.type,
        product: e.product?.name || '—',
        sku: e.product?.sku || '—',
        warehouse: e.warehouse?.name || '—',
        change: e.change,
        balanceAfter: e.balanceAfter ?? '—',
        valueAfter: parseFloat((e.valueAfter || 0).toFixed(2)),
        reason: e.reason || '—',
        reference: e.reference || '—',
        performedBy: e.performedBy?.email || e.performedBy?.name || 'System',
    }));

    const exportColumns = [
        { key: 'date', label: 'Date' },
        { key: 'type', label: 'Type' },
        { key: 'product', label: 'Product' },
        { key: 'sku', label: 'SKU' },
        { key: 'warehouse', label: 'Warehouse' },
        { key: 'change', label: 'Qty Change' },
        { key: 'balanceAfter', label: 'Balance After' },
        { key: 'valueAfter', label: `Inventory Value After (${symbol})` },
        { key: 'reason', label: 'Reason' },
        { key: 'reference', label: 'Reference' },
        { key: 'performedBy', label: 'Performed By' },
    ];

    return (
        <div className="page-container">
            <div className="page-header">
                <h1>Inventory History</h1>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <button onClick={() => fetchLedger(page)} className="btn btn-secondary" style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.85rem' }}>
                        <FiRefreshCw size={14} /> Refresh
                    </button>
                    {entries.length > 0 && (
                        <ExportButton data={getExportData()} columns={exportColumns}
                            filename={`inventory-history-${new Date().toISOString().split('T')[0]}`} label="Export" />
                    )}
                </div>
            </div>

            {/* Stats */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
                <StatCard label="Units In" value={`+${stats.totalIn.toLocaleString()}`} color="#10B981" sub="this page" />
                <StatCard label="Units Out" value={`-${stats.totalOut.toLocaleString()}`} color="#EF4444" sub="this page" />
                <StatCard label="Net Change" value={(stats.netChange >= 0 ? '+' : '') + stats.netChange.toLocaleString()} color={stats.netChange >= 0 ? '#10B981' : '#EF4444'} sub="this page" />
                <StatCard label="Latest Inventory Value" value={fmt(stats.valueChange)} color="#1D4ED8" sub="most recent entry on page" />
                <StatCard label="Total Records" value={total.toLocaleString()} sub={`page ${page} of ${pages}`} />
            </div>

            {/* Filters */}
            <div style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '10px', padding: '1rem 1.25rem', marginBottom: '1.5rem' }}>
                <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'flex-end' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                        <label style={{ fontSize: '0.75rem', fontWeight: 600, color: '#64748B' }}>Type</label>
                        <select value={filterType} onChange={e => setFilterType(e.target.value)} className="filter-select" style={{ minWidth: '150px' }}>
                            <option value="">All Types</option>
                            {Object.entries(TYPE_META).map(([k, v]) => (
                                <option key={k} value={k}>{v.label}</option>
                            ))}
                        </select>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                        <label style={{ fontSize: '0.75rem', fontWeight: 600, color: '#64748B' }}>Warehouse</label>
                        <select value={filterWarehouse} onChange={e => setFilterWarehouse(e.target.value)} className="filter-select" style={{ minWidth: '160px' }}>
                            <option value="">All Warehouses</option>
                            {warehouses.map(w => <option key={w._id} value={w._id}>{w.name}</option>)}
                        </select>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                        <label style={{ fontSize: '0.75rem', fontWeight: 600, color: '#64748B' }}>Product</label>
                        <select value={filterProduct} onChange={e => setFilterProduct(e.target.value)} className="filter-select" style={{ minWidth: '180px' }}>
                            <option value="">All Products</option>
                            {products.map(p => <option key={p._id} value={p._id}>{p.name}</option>)}
                        </select>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                        <label style={{ fontSize: '0.75rem', fontWeight: 600, color: '#64748B' }}>From</label>
                        <input type="date" value={dateRange.startDate}
                            onChange={e => setDateRange(d => ({ ...d, startDate: e.target.value }))}
                            style={{ padding: '7px 10px', borderRadius: '6px', border: '1px solid #E2E8F0', fontSize: '0.85rem' }} />
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                        <label style={{ fontSize: '0.75rem', fontWeight: 600, color: '#64748B' }}>To</label>
                        <input type="date" value={dateRange.endDate}
                            onChange={e => setDateRange(d => ({ ...d, endDate: e.target.value }))}
                            style={{ padding: '7px 10px', borderRadius: '6px', border: '1px solid #E2E8F0', fontSize: '0.85rem' }} />
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                        <label style={{ fontSize: '0.75rem', fontWeight: 600, color: '#64748B' }}>Reference / Note</label>
                        <input type="text" value={filterSearch} onChange={e => setFilterSearch(e.target.value)}
                            placeholder="Search reference..."
                            style={{ padding: '7px 10px', borderRadius: '6px', border: '1px solid #E2E8F0', fontSize: '0.85rem', minWidth: '160px' }} />
                    </div>
                    {hasFilters && (
                        <button onClick={handleClear} className="btn btn-secondary"
                            style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.8rem', padding: '7px 12px', alignSelf: 'flex-end' }}>
                            <FiX size={13} /> Clear
                        </button>
                    )}
                </div>
            </div>

            {/* Table */}
            {loading ? <Spinner fullPage /> : (
                <>
                    <div className="table-container">
                        <table className="data-table">
                            <thead>
                                <tr>
                                    <th>Date & Time</th>
                                    <th>Type</th>
                                    <th>Product</th>
                                    <th>Warehouse</th>
                                    <th style={{ textAlign: 'right' }}>Qty Change</th>
                                    <th style={{ textAlign: 'right' }}>Balance After</th>
                                    <th style={{ textAlign: 'right' }}>Inventory Value After</th>
                                    <th>Reason</th>
                                    <th>Reference</th>
                                    <th>Performed By</th>
                                </tr>
                            </thead>
                            <tbody>
                                {entries.length === 0 ? (
                                    <tr><td colSpan="10" style={{ textAlign: 'center', padding: '3rem', color: '#94A3B8' }}>No inventory history found.</td></tr>
                                ) : entries.map(e => {
                                    const meta = TYPE_META[e.type] || { label: e.type, color: '#64748B', bg: '#F1F5F9' };
                                    const isPositive = e.change > 0;
                                    return (
                                        <tr key={e._id}>
                                            <td style={{ whiteSpace: 'nowrap', fontSize: '0.82rem', color: '#64748B' }}>{fmtDate(e.createdAt)}</td>
                                            <td>
                                                <span style={{ padding: '2px 10px', borderRadius: '99px', fontSize: '0.72rem', fontWeight: 700, background: meta.bg, color: meta.color, whiteSpace: 'nowrap' }}>
                                                    {meta.label}
                                                </span>
                                            </td>
                                            <td>
                                                <div style={{ fontWeight: 500, fontSize: '0.88rem' }}>{e.product?.name || '—'}</div>
                                                {e.product?.sku && <div style={{ fontSize: '0.72rem', color: '#94A3B8' }}>{e.product.sku}</div>}
                                            </td>
                                            <td style={{ fontSize: '0.88rem' }}>{e.warehouse?.name || '—'}</td>
                                            <td style={{ textAlign: 'right', fontWeight: 700 }}>
                                                <span style={{ color: isPositive ? '#10B981' : '#EF4444', display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '3px' }}>
                                                    {isPositive ? <FiArrowUp size={12} /> : <FiArrowDown size={12} />}
                                                    {isPositive ? '+' : ''}{e.change.toLocaleString()}
                                                </span>
                                            </td>
                                            <td style={{ textAlign: 'right', fontSize: '0.88rem', color: '#475569' }}>
                                                {e.balanceAfter != null ? e.balanceAfter.toLocaleString() : '—'}
                                            </td>
                                            <td style={{ textAlign: 'right', fontWeight: 600, color: '#1D4ED8', fontSize: '0.88rem' }}>
                                                {e.valueAfter > 0 ? fmt(e.valueAfter) : (
                                                    <span style={{ color: '#94A3B8', fontSize: '0.78rem' }}>
                                                        bal:{e._balanceAfter ?? '?'} × {symbol}{e._costUsed ?? '?'}
                                                    </span>
                                                )}
                                            </td>
                                            <td style={{ fontSize: '0.82rem', color: '#475569', maxWidth: '180px' }}>{e.reason || '—'}</td>
                                            <td style={{ fontSize: '0.82rem', color: '#4880FF', fontFamily: 'monospace' }}>{e.reference || '—'}</td>
                                            <td style={{ fontSize: '0.82rem', color: '#64748B' }}>{e.performedBy?.email || e.performedBy?.name || 'System'}</td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>

                    {/* Pagination */}
                    {pages > 1 && (
                        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '0.5rem', marginTop: '1.5rem' }}>
                            <button onClick={() => fetchLedger(page - 1)} disabled={page <= 1} className="btn btn-secondary" style={{ padding: '6px 14px', fontSize: '0.85rem' }}>
                                ← Prev
                            </button>
                            <span style={{ fontSize: '0.88rem', color: '#64748B' }}>
                                Page {page} of {pages} ({total.toLocaleString()} records)
                            </span>
                            <button onClick={() => fetchLedger(page + 1)} disabled={page >= pages} className="btn btn-secondary" style={{ padding: '6px 14px', fontSize: '0.85rem' }}>
                                Next →
                            </button>
                        </div>
                    )}
                </>
            )}
        </div>
    );
};

export default InventoryHistory;
