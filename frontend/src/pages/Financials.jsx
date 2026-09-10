import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useCountry } from '../context/CountryContext';
import api from '../utils/api';
import {
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
    LineChart, Line, PieChart, Pie, Cell, ComposedChart, Area
} from 'recharts';
import { FiDollarSign, FiTrendingUp, FiPackage, FiShoppingCart, FiAlertCircle, FiFilter } from 'react-icons/fi';
import Spinner from '../components/Spinner';
import ExportButton from '../components/ExportButton';
import useCurrency from '../hooks/useCurrency';

const COLORS = ['#4880FF', '#10B981', '#64748B', '#8B5CF6', '#F59E0B', '#EC4899'];

const Financials = () => {
    const { user } = useAuth();
    const { activeCountry } = useCountry();
    const { symbol } = useCurrency();
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [dateRange, setDateRange] = useState({ startDate: '', endDate: '' });
    const [activeView, setActiveView] = useState('overview'); // overview, inventory, sales, profit, trends
    const [trendPeriod, setTrendPeriod] = useState('past365');

    useEffect(() => {
        console.log('Current user:', user);
        console.log('User role:', user?.role);
        if (activeCountry?._id) fetchFinancials();
    }, [trendPeriod, activeCountry?._id]);

    const fetchFinancials = async () => {
        setLoading(true);
        try {
            const params = new URLSearchParams();
            if (dateRange.startDate) params.append('startDate', dateRange.startDate);
            if (dateRange.endDate) params.append('endDate', dateRange.endDate);
            params.append('trendPeriod', trendPeriod);
            if (activeCountry?._id) params.append('countryId', activeCountry._id);
            const res = await api.get(`/financials?${params.toString()}`);
            console.log('Financials data received:', res.data);
            setData(res.data.data);
            setLoading(false);
        } catch (err) {
            console.error('Failed to load financials:', err);
            console.error('Error response:', err.response?.data);
            console.error('Error status:', err.response?.status);
            
            if (err.response?.status === 403) {
                alert('Access Denied: This page is only accessible to Admin users.');
            } else if (err.response?.status === 401) {
                alert('Authentication Error: Please log in again.');
            } else if (err.response?.status === 404) {
                alert('API Endpoint Not Found: The server may need to be restarted.');
            } else {
                alert('Failed to load financial data. Check console for details.');
            }
            
            setLoading(false);
        }
    };

    const handleDateFilter = () => {
        fetchFinancials();
    };

    const formatCurrency = (value) => {
        return `${symbol}${value?.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) || '0.00'}`;
    };

    const formatNumber = (value) => {
        return value?.toLocaleString() || '0';
    };

    if (loading) return <Spinner fullPage />;
    if (!data) return (
        <div className="page-container">
            <div className="page-header">
                <h1>Financial Analytics</h1>
            </div>
            <div style={{ 
                padding: '40px', 
                textAlign: 'center', 
                background: '#FEF2F2', 
                borderRadius: '8px',
                border: '1px solid #FCA5A5'
            }}>
                <FiAlertCircle size={48} style={{ color: '#DC2626', marginBottom: '16px' }} />
                <h3 style={{ color: '#991B1B', marginBottom: '8px' }}>Failed to Load Financial Data</h3>
                <p style={{ color: '#7F1D1D', marginBottom: '16px' }}>
                    This page is only accessible to Admin users. Please check your permissions.
                </p>
                <button onClick={fetchFinancials} className="btn btn-primary">
                    Retry
                </button>
            </div>
        </div>
    );

    const { summary, inventory, sales, profitAnalysis, trends } = data;

    return (
        <div className="page-container">
            <div className="page-header">
                <div>
                    <h1>Financial Analytics</h1>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginTop: '4px' }}>
                        {activeCountry && (
                            <span style={{ fontSize: '0.8rem', fontWeight: 600, background: '#F0F4FF', color: '#4880FF', padding: '4px 12px', borderRadius: '20px', border: '1px solid #D1DEFF' }}>
                                🌍 {activeCountry.name}
                            </span>
                        )}
                        <p style={{ color: '#64748B', fontSize: '0.9rem' }}>
                            Comprehensive financial overview and cost analysis
                        </p>
                    </div>
                </div>
                
                <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                    <input
                        type="date"
                        value={dateRange.startDate}
                        onChange={(e) => setDateRange({ ...dateRange, startDate: e.target.value })}
                        style={{ padding: '8px', borderRadius: '6px', border: '1px solid #E2E8F0' }}
                    />
                    <span>to</span>
                    <input
                        type="date"
                        value={dateRange.endDate}
                        onChange={(e) => setDateRange({ ...dateRange, endDate: e.target.value })}
                        style={{ padding: '8px', borderRadius: '6px', border: '1px solid #E2E8F0' }}
                    />
                    <button onClick={handleDateFilter} className="btn btn-primary">Apply</button>
                    {(dateRange.startDate || dateRange.endDate) && (
                        <button 
                            onClick={() => {
                                setDateRange({ startDate: '', endDate: '' });
                                setTimeout(fetchFinancials, 100);
                            }} 
                            className="btn btn-secondary"
                        >
                            Clear
                        </button>
                    )}
                </div>
            </div>

            {/* KEY METRICS SUMMARY */}
            <div style={{ 
                display: 'grid', 
                gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', 
                gap: '16px',
                marginBottom: '24px'
            }}>
                <div className="dashboard-card" style={{ borderLeft: '4px solid #4880FF' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                        <div>
                            <div style={{ fontSize: '0.8rem', color: '#64748B', marginBottom: '8px' }}>
                                Total Inventory Value
                            </div>
                            <div style={{ fontSize: '1.75rem', fontWeight: 'bold', color: '#1E293B' }}>
                                {formatCurrency(summary.totalInventoryValue)}
                            </div>
                            <div style={{ fontSize: '0.75rem', color: '#94A3B8', marginTop: '4px' }}>
                                Current stock valuation
                            </div>
                        </div>
                        <FiPackage size={28} style={{ color: '#4880FF', opacity: 0.6 }} />
                    </div>
                </div>

                <div className="dashboard-card" style={{ borderLeft: '4px solid #10B981' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                        <div>
                            <div style={{ fontSize: '0.8rem', color: '#64748B', marginBottom: '8px' }}>
                                Total Sales Revenue
                            </div>
                            <div style={{ fontSize: '1.75rem', fontWeight: 'bold', color: '#1E293B' }}>
                                {formatCurrency(summary.totalSalesRevenue)}
                            </div>
                            <div style={{ fontSize: '0.75rem', color: '#94A3B8', marginTop: '4px' }}>
                                {formatNumber(summary.totalOrders)} orders completed
                            </div>
                        </div>
                        <FiShoppingCart size={28} style={{ color: '#10B981', opacity: 0.6 }} />
                    </div>
                </div>

                <div className="dashboard-card" style={{ borderLeft: '4px solid #8B5CF6' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                        <div>
                            <div style={{ fontSize: '0.8rem', color: '#64748B', marginBottom: '8px' }}>
                                Average Order Value
                            </div>
                            <div style={{ fontSize: '1.75rem', fontWeight: 'bold', color: '#1E293B' }}>
                                {formatCurrency(summary.avgOrderValue)}
                            </div>
                            <div style={{ fontSize: '0.75rem', color: '#94A3B8', marginTop: '4px' }}>
                                Per transaction
                            </div>
                        </div>
                        <FiDollarSign size={28} style={{ color: '#8B5CF6', opacity: 0.6 }} />
                    </div>
                </div>

                {/* <div className="dashboard-card" style={{ borderLeft: '4px solid #F59E0B' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                        <div>
                            <div style={{ fontSize: '0.8rem', color: '#64748B', marginBottom: '8px' }}>
                                Inventory Turnover
                            </div>
                            <div style={{ fontSize: '1.75rem', fontWeight: 'bold', color: '#1E293B' }}>
                                {summary.totalInventoryValue > 0 
                                    ? ((summary.totalSalesRevenue / summary.totalInventoryValue) * 100).toFixed(1)
                                    : '0.0'
                                }%
                            </div>
                            <div style={{ fontSize: '0.75rem', color: '#94A3B8', marginTop: '4px' }}>
                                Sales vs Stock ratio
                            </div>
                        </div>
                        <FiTrendingUp size={28} style={{ color: '#F59E0B', opacity: 0.6 }} />
                    </div>
                </div> */}
            </div>

            {/* VIEW FILTER TABS */}
            <div style={{ 
                display: 'flex', 
                gap: '8px', 
                marginBottom: '24px',
                borderBottom: '2px solid #E2E8F0',
                paddingBottom: '0',
                overflowX: 'auto',
                WebkitOverflowScrolling: 'touch',
                scrollbarWidth: 'none',
                msOverflowStyle: 'none'
            }}>
                {[
                    { id: 'overview', label: 'Overview', icon: <FiFilter /> },
                    { id: 'inventory', label: 'Inventory', icon: <FiPackage /> },
                    { id: 'sales', label: 'Sales', icon: <FiShoppingCart /> },
                    { id: 'profit', label: 'Performance', icon: <FiDollarSign /> },
                    { id: 'trends', label: 'Trends', icon: <FiTrendingUp /> }
                ].map(view => (
                    <button
                        key={view.id}
                        onClick={() => setActiveView(view.id)}
                        style={{
                            padding: '12px 16px',
                            border: 'none',
                            background: activeView === view.id ? '#F8FAFC' : 'transparent',
                            borderBottom: activeView === view.id ? '2px solid #4880FF' : '2px solid transparent',
                            color: activeView === view.id ? '#4880FF' : '#64748B',
                            fontWeight: activeView === view.id ? 600 : 400,
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px',
                            fontSize: '0.9rem',
                            transition: 'all 0.2s',
                            marginBottom: '-2px',
                            whiteSpace: 'nowrap',
                            flexShrink: 0
                        }}
                    >
                        {view.icon}
                        <span className="tab-label">{view.label}</span>
                    </button>
                ))}
            </div>

            {/* OVERVIEW VIEW */}
            {activeView === 'overview' && (
                <div>
                    <div className="dashboard-card" style={{ marginBottom: '24px', background: '#FFFBEB', border: '1px solid #FDE68A' }}>
                        <h3 style={{ color: '#92400E', marginBottom: '12px', fontSize: '1rem' }}>
                            Key Financial Metrics
                        </h3>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '16px', fontSize: '0.85rem', color: '#78350F' }}>
                            <div>
                                <strong>Total Inventory Value:</strong> Sum of (quantity × price) for all products currently in stock
                            </div>
                            <div>
                                <strong>Total Sales Revenue:</strong> Sum of all completed order amounts (excluding cancelled orders)
                            </div>
                            <div>
                                <strong>Average Order Value:</strong> Total Revenue ÷ Number of Orders
                            </div>
                            <div>
                                <strong>Inventory Turnover:</strong> (Sales Revenue ÷ Inventory Value) × 100 - measures how efficiently stock is moving
                            </div>
                        </div>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '24px' }}>
                        <div className="dashboard-card">
                            <h3 style={{ marginBottom: '15px', fontSize: '1rem', color: '#1E293B' }}>Inventory Value by Brand</h3>
                            <ResponsiveContainer width="100%" height={280}>
                                <BarChart data={inventory.byBrand.slice(0, 8)} layout="vertical">
                                    <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                                    <XAxis type="number" tick={{ fill: '#64748B', fontSize: 11 }} />
                                    <YAxis dataKey="brandName" type="category" width={90} tick={{ fill: '#1E293B', fontSize: 11 }} />
                                    <Tooltip formatter={(value) => formatCurrency(value)} />
                                    <Bar dataKey="totalCost" fill="#4880FF" name="Cost Value" radius={[0, 4, 4, 0]} />
                                </BarChart>
                            </ResponsiveContainer>
                        </div>

                        <div className="dashboard-card">
                            <h3 style={{ marginBottom: '15px', fontSize: '1rem', color: '#1E293B' }}>Sales Revenue by Region</h3>
                            <ResponsiveContainer width="100%" height={280}>
                                <BarChart data={sales.byRegion}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                                    <XAxis dataKey="regionName" tick={{ fill: '#64748B', fontSize: 11 }} />
                                    <YAxis tick={{ fill: '#64748B', fontSize: 11 }} />
                                    <Tooltip formatter={(value) => formatCurrency(value)} />
                                    <Bar dataKey="totalRevenue" fill="#10B981" name="Revenue" radius={[4, 4, 0, 0]} />
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    </div>

                    <div className="dashboard-card">
                        <h3 style={{ marginBottom: '15px', fontSize: '1rem', color: '#1E293B' }}>Quick Summary</h3>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px' }}>
                            <div style={{ padding: '12px', background: '#F8FAFC', borderRadius: '6px' }}>
                                <div style={{ fontSize: '0.75rem', color: '#64748B', marginBottom: '4px' }}>Warehouses</div>
                                <div style={{ fontSize: '1.25rem', fontWeight: 600, color: '#1E293B' }}>
                                    {inventory.byWarehouse.length}
                                </div>
                            </div>
                            <div style={{ padding: '12px', background: '#F8FAFC', borderRadius: '6px' }}>
                                <div style={{ fontSize: '0.75rem', color: '#64748B', marginBottom: '4px' }}>Active Brands</div>
                                <div style={{ fontSize: '1.25rem', fontWeight: 600, color: '#1E293B' }}>
                                    {inventory.byBrand.length}
                                </div>
                            </div>
                            <div style={{ padding: '12px', background: '#F8FAFC', borderRadius: '6px' }}>
                                <div style={{ fontSize: '0.75rem', color: '#64748B', marginBottom: '4px' }}>Categories</div>
                                <div style={{ fontSize: '1.25rem', fontWeight: 600, color: '#1E293B' }}>
                                    {inventory.byCategory.length}
                                </div>
                            </div>
                            <div style={{ padding: '12px', background: '#F8FAFC', borderRadius: '6px' }}>
                                <div style={{ fontSize: '0.75rem', color: '#64748B', marginBottom: '4px' }}>Regions</div>
                                <div style={{ fontSize: '1.25rem', fontWeight: 600, color: '#1E293B' }}>
                                    {sales.byRegion.length}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* INVENTORY ANALYSIS VIEW */}
            {activeView === 'inventory' && (
                <div>
                    <div className="dashboard-card" style={{ marginBottom: '20px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
                            <h3 style={{ fontSize: '1rem', color: '#1E293B', margin: 0 }}>Inventory Valuation by Warehouse</h3>
                            {inventory.byWarehouse?.length > 0 && (
                                <ExportButton
                                    data={inventory.byWarehouse.map(wh => ({
                                        warehouse: wh.warehouseName || '',
                                        totalUnits: wh.totalUnits || 0,
                                        totalCBM: parseFloat((wh.totalCBM || 0).toFixed(3)),
                                        totalValue: parseFloat((wh.totalCost || 0).toFixed(2)),
                                        percentOfTotal: parseFloat(((wh.totalCost / summary.totalInventoryValue * 100) || 0).toFixed(2))
                                    }))}
                                    columns={[
                                        { key: 'warehouse', label: 'Warehouse' },
                                        { key: 'totalUnits', label: 'Total Units' },
                                        { key: 'totalCBM', label: 'Total CBM (m³)' },
                                        { key: 'totalValue', label: `Total Value (${symbol})` },
                                        { key: 'percentOfTotal', label: '% of Total Inventory' }
                                    ]}
                                    filename={`inventory-by-warehouse-${new Date().toISOString().split('T')[0]}`}
                                    label="Export"
                                />
                            )}
                        </div>
                        <div style={{ overflowX: 'auto' }}>
                            <table className="data-table" style={{ minWidth: '800px' }}>
                                <thead>
                                    <tr>
                                        <th>Warehouse</th>
                                        <th>Total Units</th>
                                        <th>Total CBM</th>
                                        <th>Total Value</th>
                                        <th>% of Total Inventory</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {inventory.byWarehouse.map((wh, idx) => (
                                        <tr key={idx}>
                                            <td><strong>{wh.warehouseName}</strong></td>
                                            <td>{formatNumber(wh.totalUnits)}</td>
                                            <td><span style={{ color: '#8B5CF6', fontWeight: 600 }}>{wh.totalCBM?.toFixed(3) || '0.000'} m³</span></td>
                                            <td style={{ color: '#4880FF', fontWeight: 600 }}>{formatCurrency(wh.totalCost)}</td>
                                            <td>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                    <div style={{ 
                                                        width: '100px', 
                                                        height: '8px', 
                                                        background: '#E5E7EB', 
                                                        borderRadius: '4px',
                                                        overflow: 'hidden'
                                                    }}>
                                                        <div style={{ 
                                                            width: `${(wh.totalCost / summary.totalInventoryValue * 100)}%`, 
                                                            height: '100%',
                                                            background: '#4880FF',
                                                            transition: 'width 0.3s'
                                                        }} />
                                                    </div>
                                                    <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>
                                                        {((wh.totalCost / summary.totalInventoryValue) * 100).toFixed(1)}%
                                                    </span>
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    
                        <div className="dashboard-card" style={{ marginBottom: '20px' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
                                <h3 style={{ fontSize: '1rem', color: '#1E293B', margin: 0 }}>By Brand</h3>
                                {inventory.byBrand?.length > 0 && (
                                    <ExportButton
                                        data={inventory.byBrand.map(b => ({
                                            brand: b.brandName || '',
                                            units: b.totalUnits || 0,
                                            cbm: parseFloat((b.totalCBM || 0).toFixed(3)),
                                            totalValue: parseFloat((b.totalCost || 0).toFixed(2))
                                        }))}
                                        columns={[
                                            { key: 'brand', label: 'Brand' },
                                            { key: 'units', label: 'Units' },
                                            { key: 'cbm', label: 'CBM (m³)' },
                                            { key: 'totalValue', label: `Total Value (${symbol})` }
                                        ]}
                                        filename={`inventory-by-brand-${new Date().toISOString().split('T')[0]}`}
                                        label="Export"
                                    />
                                )}
                            </div>
                            <div style={{ overflowX: 'auto', maxHeight: '400px' }}>
                                <table className="data-table" style={{ minWidth: '800px' }}>
                                    <thead>
                                        <tr>
                                            <th>Brand</th>
                                            <th>Units</th>
                                            <th>CBM</th>
                                            <th>Total Value</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {inventory.byBrand.map((brand, idx) => (
                                            <tr key={idx}>
                                                <td><strong>{brand.brandName}</strong></td>
                                                <td>{formatNumber(brand.totalUnits)}</td>
                                                <td><span style={{ color: '#8B5CF6' }}>{brand.totalCBM?.toFixed(3) || '0.000'} m³</span></td>
                                                <td style={{ color: '#4880FF' }}>{formatCurrency(brand.totalCost)}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>

                        <div className="dashboard-card" style={{ marginBottom: '20px' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
                                <h3 style={{ fontSize: '1rem', color: '#1E293B', margin: 0 }}>By Category</h3>
                                {inventory.byCategory?.length > 0 && (
                                    <ExportButton
                                        data={inventory.byCategory.map(c => ({
                                            category: c.categoryName || '',
                                            units: c.totalUnits || 0,
                                            cbm: parseFloat((c.totalCBM || 0).toFixed(3)),
                                            totalValue: parseFloat((c.totalCost || 0).toFixed(2))
                                        }))}
                                        columns={[
                                            { key: 'category', label: 'Category' },
                                            { key: 'units', label: 'Units' },
                                            { key: 'cbm', label: 'CBM (m³)' },
                                            { key: 'totalValue', label: `Total Value (${symbol})` }
                                        ]}
                                        filename={`inventory-by-category-${new Date().toISOString().split('T')[0]}`}
                                        label="Export"
                                    />
                                )}
                            </div>
                            <div style={{ overflowX: 'auto', maxHeight: '400px' }}>
                                <table className="data-table">
                                    <thead>
                                        <tr>
                                            <th>Category</th>
                                            <th>Units</th>
                                            <th>CBM</th>
                                            <th>Total Value</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {inventory.byCategory.map((cat, idx) => (
                                            <tr key={idx}>
                                                <td><strong>{cat.categoryName}</strong></td>
                                                <td>{formatNumber(cat.totalUnits)}</td>
                                                <td><span style={{ color: '#8B5CF6' }}>{cat.totalCBM?.toFixed(3) || '0.000'} m³</span></td>
                                                <td style={{ color: '#4880FF' }}>{formatCurrency(cat.totalCost)}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    

                    <div className="dashboard-card">
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
                            <h3 style={{ fontSize: '1rem', color: '#1E293B', margin: 0 }}>Top 20 Products by Inventory Value</h3>
                            {inventory.topProducts?.length > 0 && (
                                <ExportButton
                                    data={inventory.topProducts.map(p => ({
                                        sku: p.sku || '',
                                        productName: p.productName || '',
                                        quantity: p.totalQuantity || 0,
                                        cbm: parseFloat((p.totalCBM || 0).toFixed(3)),
                                        unitPrice: parseFloat((p.unitPrice || 0).toFixed(2)),
                                        totalValue: parseFloat((p.totalValue || 0).toFixed(2))
                                    }))}
                                    columns={[
                                        { key: 'sku', label: 'SKU' },
                                        { key: 'productName', label: 'Product Name' },
                                        { key: 'quantity', label: 'Quantity' },
                                        { key: 'cbm', label: 'CBM (m³)' },
                                        { key: 'unitPrice', label: `Unit Price (${symbol})` },
                                        { key: 'totalValue', label: `Total Value (${symbol})` }
                                    ]}
                                    filename={`top-products-by-value-${new Date().toISOString().split('T')[0]}`}
                                    label="Export"
                                />
                            )}
                        </div>
                        <div style={{ overflowX: 'auto' }}>
                            <table className="data-table" style={{ minWidth: '800px' }}>
                                <thead>
                                    <tr>
                                        <th>SKU</th>
                                        <th>Product Name</th>
                                        <th>Quantity</th>
                                        <th>CBM</th>
                                        <th>Unit Price</th>
                                        <th>Total Value</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {inventory.topProducts.map((prod, idx) => (
                                        <tr key={idx}>
                                            <td><code style={{ fontSize: '0.75rem' }}>{prod.sku}</code></td>
                                            <td><strong>{prod.productName}</strong></td>
                                            <td>{formatNumber(prod.quantity)}</td>
                                            <td><span style={{ color: '#8B5CF6' }}>{prod.totalCBM?.toFixed(3) || '0.000'} m³</span></td>
                                            <td>{formatCurrency(prod.unitPrice)}</td>
                                            <td style={{ color: '#4880FF', fontWeight: 600 }}>{formatCurrency(prod.totalRetailValue)}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            )}

            {/* SALES PERFORMANCE VIEW */}
            {activeView === 'sales' && (
                <div>
                    <div className="dashboard-card" style={{ marginBottom: '20px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
                            <h3 style={{ fontSize: '1rem', color: '#1E293B', margin: 0 }}>Sales Revenue by Warehouse</h3>
                            {sales.byWarehouse?.length > 0 && (
                                <ExportButton
                                    data={sales.byWarehouse.map(wh => ({
                                        warehouse: wh.warehouseName || '',
                                        totalOrders: wh.totalOrders || 0,
                                        totalRevenue: parseFloat((wh.totalRevenue || 0).toFixed(2)),
                                        avgOrderValue: parseFloat((wh.avgOrderValue || 0).toFixed(2))
                                    }))}
                                    columns={[
                                        { key: 'warehouse', label: 'Warehouse' },
                                        { key: 'totalOrders', label: 'Total Orders' },
                                        { key: 'totalRevenue', label: `Total Revenue (${symbol})` },
                                        { key: 'avgOrderValue', label: `Avg Order Value (${symbol})` }
                                    ]}
                                    filename={`sales-by-warehouse-${new Date().toISOString().split('T')[0]}`}
                                    label="Export"
                                />
                            )}
                        </div>
                        <div style={{ overflowX: 'auto' }}>
                            <table className="data-table">
                                <thead>
                                    <tr>
                                        <th>Warehouse</th>
                                        <th>Total Orders</th>
                                        <th>Total Revenue</th>
                                        <th>Avg Order Value</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {sales.byWarehouse.map((wh, idx) => (
                                        <tr key={idx}>
                                            <td><strong>{wh.warehouseName}</strong></td>
                                            <td>{formatNumber(wh.totalOrders)}</td>
                                            <td style={{ color: '#10B981', fontWeight: 600 }}>{formatCurrency(wh.totalRevenue)}</td>
                                            <td>{formatCurrency(wh.avgOrderValue)}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    
                        <div className="dashboard-card" style={{ marginBottom: '20px' }}>
                            <h3 style={{ marginBottom: '15px', fontSize: '1rem', color: '#1E293B' }}>By Brand</h3>
                            <ResponsiveContainer width="100%" height={300}>
                                <BarChart data={sales.byBrand.slice(0, 10)}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                                    <XAxis dataKey="brandName" angle={-45} textAnchor="end" height={100} tick={{ fill: '#64748B', fontSize: 10 }} />
                                    <YAxis tick={{ fill: '#64748B', fontSize: 11 }} />
                                    <Tooltip formatter={(value) => formatCurrency(value)} />
                                    <Bar dataKey="totalRevenue" fill="#10B981" name="Revenue" radius={[4, 4, 0, 0]} />
                                </BarChart>
                            </ResponsiveContainer>
                        </div>

                        <div className="dashboard-card" style={{ marginBottom: '20px' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
                                <h3 style={{ fontSize: '1rem', color: '#1E293B', margin: 0 }}>By Category</h3>
                                {sales.byCategory?.length > 0 && (
                                    <ExportButton
                                        data={sales.byCategory.map(c => ({
                                            category: c.categoryName || '',
                                            unitsSold: c.totalUnitsSold || 0,
                                            revenue: parseFloat((c.totalRevenue || 0).toFixed(2))
                                        }))}
                                        columns={[
                                            { key: 'category', label: 'Category' },
                                            { key: 'unitsSold', label: 'Units Sold' },
                                            { key: 'revenue', label: `Revenue (${symbol})` }
                                        ]}
                                        filename={`sales-by-category-${new Date().toISOString().split('T')[0]}`}
                                        label="Export"
                                    />
                                )}
                            </div>
                            <div style={{ overflowX: 'auto', maxHeight: '300px' }}>
                                <table className="data-table">
                                    <thead>
                                        <tr>
                                            <th>Category</th>
                                            <th>Units Sold</th>
                                            <th>Revenue</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {sales.byCategory.map((cat, idx) => (
                                            <tr key={idx}>
                                                <td><strong>{cat.categoryName}</strong></td>
                                                <td>{formatNumber(cat.totalUnitsSold)}</td>
                                                <td style={{ color: '#10B981', fontWeight: 600 }}>{formatCurrency(cat.totalRevenue)}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    

                    <div className="dashboard-card">
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
                            <h3 style={{ fontSize: '1rem', color: '#1E293B', margin: 0 }}>Top 20 Selling Products (by Revenue)</h3>
                            {sales.topProducts?.length > 0 && (
                                <ExportButton
                                    data={sales.topProducts.map((p, idx) => ({
                                        rank: idx + 1,
                                        sku: p.sku || '',
                                        productName: p.productName || '',
                                        unitsSold: p.totalUnitsSold || 0,
                                        avgPrice: parseFloat((p.avgPrice || 0).toFixed(2)),
                                        totalRevenue: parseFloat((p.totalRevenue || 0).toFixed(2))
                                    }))}
                                    columns={[
                                        { key: 'rank', label: 'Rank' },
                                        { key: 'sku', label: 'SKU' },
                                        { key: 'productName', label: 'Product Name' },
                                        { key: 'unitsSold', label: 'Units Sold' },
                                        { key: 'avgPrice', label: `Avg Price (${symbol})` },
                                        { key: 'totalRevenue', label: `Total Revenue (${symbol})` }
                                    ]}
                                    filename={`top-selling-products-${new Date().toISOString().split('T')[0]}`}
                                    label="Export"
                                />
                            )}
                        </div>
                        <div style={{ overflowX: 'auto' }}>
                            <table className="data-table" style={{ minWidth: '700px' }}>
                                <thead>
                                    <tr>
                                        <th>Rank</th>
                                        <th>SKU</th>
                                        <th>Product Name</th>
                                        <th>Units Sold</th>
                                        <th>Avg Price</th>
                                        <th>Total Revenue</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {sales.topProducts.map((prod, idx) => (
                                        <tr key={idx}>
                                            <td>
                                                <span style={{
                                                    background: idx < 3 ? '#FEF3C7' : '#F3F4F6',
                                                    color: idx < 3 ? '#92400E' : '#374151',
                                                    padding: '4px 8px',
                                                    borderRadius: '4px',
                                                    fontWeight: 600,
                                                    fontSize: '0.85rem'
                                                }}>
                                                    #{idx + 1}
                                                </span>
                                            </td>
                                            <td><code style={{ fontSize: '0.75rem' }}>{prod.sku}</code></td>
                                            <td><strong>{prod.productName}</strong></td>
                                            <td>{formatNumber(prod.totalUnitsSold)}</td>
                                            <td>{formatCurrency(prod.avgPrice)}</td>
                                            <td style={{ color: '#10B981', fontWeight: 600 }}>{formatCurrency(prod.totalRevenue)}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            )}

            {/* PROFIT ANALYSIS VIEW */}
            {activeView === 'profit' && (
                <div>
                    <div className="dashboard-card" style={{ marginBottom: '20px', background: '#F0F9FF', border: '1px solid #BAE6FD' }}>
                        <h3 style={{ color: '#075985', marginBottom: '15px', fontSize: '1rem' }}>
                            Sales Performance Summary
                        </h3>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '20px' }}>
                            <div>
                                <div style={{ fontSize: '0.8rem', color: '#0C4A6E', marginBottom: '4px' }}>Total Revenue</div>
                                <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#10B981' }}>
                                    {formatCurrency(profitAnalysis.totalRevenue)}
                                </div>
                            </div>
                            <div>
                                <div style={{ fontSize: '0.8rem', color: '#0C4A6E', marginBottom: '4px' }}>Total Orders</div>
                                <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#4880FF' }}>
                                    {formatNumber(summary.totalOrders)}
                                </div>
                            </div>
                            <div>
                                <div style={{ fontSize: '0.8rem', color: '#0C4A6E', marginBottom: '4px' }}>Avg Order Value</div>
                                <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#8B5CF6' }}>
                                    {formatCurrency(summary.avgOrderValue)}
                                </div>
                            </div>
                            <div>
                                <div style={{ fontSize: '0.8rem', color: '#0C4A6E', marginBottom: '4px' }}>Stock Turnover</div>
                                <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#F59E0B' }}>
                                    {summary.totalInventoryValue > 0 
                                        ? ((summary.totalSalesRevenue / summary.totalInventoryValue) * 100).toFixed(1)
                                        : '0.0'
                                    }%
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="dashboard-card">
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
                            <h3 style={{ fontSize: '1rem', color: '#1E293B', margin: 0 }}>
                                Brand Performance: Inventory vs Sales
                            </h3>
                            {inventory.byBrand?.length > 0 && (
                                <ExportButton
                                    data={inventory.byBrand.map(invBrand => {
                                        const salesBrand = sales.byBrand.find(s => s.brandName === invBrand.brandName);
                                        const turnoverRatio = invBrand.totalUnits > 0 
                                            ? ((salesBrand?.totalUnitsSold || 0) / invBrand.totalUnits * 100).toFixed(1)
                                            : '0.0';
                                        return {
                                            brand: invBrand.brandName || '',
                                            inventoryUnits: invBrand.totalUnits || 0,
                                            inventoryValue: parseFloat((invBrand.totalCost || 0).toFixed(2)),
                                            unitsSold: salesBrand?.totalUnitsSold || 0,
                                            salesRevenue: parseFloat((salesBrand?.totalRevenue || 0).toFixed(2)),
                                            turnoverPercent: parseFloat(turnoverRatio)
                                        };
                                    })}
                                    columns={[
                                        { key: 'brand', label: 'Brand' },
                                        { key: 'inventoryUnits', label: 'Inventory Units' },
                                        { key: 'inventoryValue', label: `Inventory Value (${symbol})` },
                                        { key: 'unitsSold', label: 'Units Sold' },
                                        { key: 'salesRevenue', label: `Sales Revenue (${symbol})` },
                                        { key: 'turnoverPercent', label: 'Turnover %' }
                                    ]}
                                    filename={`brand-performance-${new Date().toISOString().split('T')[0]}`}
                                    label="Export"
                                />
                            )}
                        </div>
                        <div style={{ overflowX: 'auto' }}>
                            <table className="data-table" style={{ minWidth: '800px' }}>
                                <thead>
                                    <tr>
                                        <th>Brand</th>
                                        <th>Inventory Units</th>
                                        <th>Inventory Value</th>
                                        <th>Units Sold</th>
                                        <th>Sales Revenue</th>
                                        <th>Turnover %</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {inventory.byBrand.map((invBrand, idx) => {
                                        const salesBrand = sales.byBrand.find(s => s.brandName === invBrand.brandName);
                                        const turnoverRatio = invBrand.totalUnits > 0 
                                            ? ((salesBrand?.totalUnitsSold || 0) / invBrand.totalUnits * 100).toFixed(1)
                                            : 0;
                                        
                                        return (
                                            <tr key={idx}>
                                                <td><strong>{invBrand.brandName}</strong></td>
                                                <td>{formatNumber(invBrand.totalUnits)}</td>
                                                <td style={{ color: '#4880FF' }}>{formatCurrency(invBrand.totalCost)}</td>
                                                <td>{formatNumber(salesBrand?.totalUnitsSold || 0)}</td>
                                                <td style={{ color: '#10B981', fontWeight: 600 }}>
                                                    {formatCurrency(salesBrand?.totalRevenue || 0)}
                                                </td>
                                                <td>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                        <div style={{ 
                                                            width: '100px', 
                                                            height: '8px', 
                                                            background: '#E5E7EB', 
                                                            borderRadius: '4px',
                                                            overflow: 'hidden'
                                                        }}>
                                                            <div style={{ 
                                                                width: `${Math.min(turnoverRatio, 100)}%`, 
                                                                height: '100%',
                                                                background: turnoverRatio > 50 ? '#10B981' : turnoverRatio > 25 ? '#F59E0B' : '#DC2626',
                                                                transition: 'width 0.3s'
                                                            }} />
                                                        </div>
                                                        <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>
                                                            {turnoverRatio}%
                                                        </span>
                                                    </div>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            )}

            {/* TRENDS VIEW */}
            {activeView === 'trends' && (
                <div>
                    {/* MTD / YTD summary charts */}
                    {trends?.monthlyRevenue?.length > 0 && (() => {
                        const now = new Date();
                        const currentYear = now.getFullYear();
                        const currentMonth = now.getMonth();
                        const monthNames = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

                        // YTD: monthly data for current year
                        const ytdData = trends.monthlyRevenue
                            .filter(m => {
                                const [yr] = m.period.split('-');
                                return parseInt(yr) === currentYear;
                            })
                            .map(m => ({ month: monthNames[parseInt(m.period.split('-')[1]) - 1] || m.period, revenue: m.totalRevenue, orders: m.orderCount }));

                        // MTD: use the most recent period entry
                        const mtdEntry = trends.monthlyRevenue.find(m => {
                            const [yr, mo] = m.period.split('-');
                            return parseInt(yr) === currentYear && parseInt(mo) === currentMonth + 1;
                        });

                        return (
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1.5rem' }}>
                                <div className="dashboard-card">
                                    <div style={{ fontSize: '0.85rem', fontWeight: 600, color: '#1E293B', marginBottom: '0.5rem' }}>
                                        Month-to-Date — {now.toLocaleString('default', { month: 'long', year: 'numeric' })}
                                    </div>
                                    {mtdEntry ? (
                                        <div style={{ display: 'flex', gap: '1.5rem', alignItems: 'center', padding: '0.75rem 0' }}>
                                            <div>
                                                <div style={{ fontSize: '0.72rem', color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Revenue</div>
                                                <div style={{ fontSize: '1.6rem', fontWeight: 800, color: '#10B981' }}>{formatCurrency(mtdEntry.totalRevenue)}</div>
                                            </div>
                                            <div>
                                                <div style={{ fontSize: '0.72rem', color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Orders</div>
                                                <div style={{ fontSize: '1.6rem', fontWeight: 800, color: '#4880FF' }}>{formatNumber(mtdEntry.orderCount)}</div>
                                            </div>
                                        </div>
                                    ) : (
                                        <div style={{ color: '#94A3B8', fontSize: '0.85rem', padding: '1rem 0' }}>No data for current month.</div>
                                    )}
                                </div>
                                <div className="dashboard-card">
                                    <div style={{ fontSize: '0.85rem', fontWeight: 600, color: '#1E293B', marginBottom: '0.5rem' }}>
                                        Year-to-Date — {currentYear}
                                    </div>
                                    {ytdData.length > 0 ? (
                                        <div style={{ display: 'flex', gap: '1.5rem', alignItems: 'center', padding: '0.75rem 0' }}>
                                            <div>
                                                <div style={{ fontSize: '0.72rem', color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Revenue</div>
                                                <div style={{ fontSize: '1.6rem', fontWeight: 800, color: '#4880FF' }}>
                                                    {formatCurrency(ytdData.reduce((s, m) => s + m.revenue, 0))}
                                                </div>
                                            </div>
                                            <div>
                                                <div style={{ fontSize: '0.72rem', color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Orders</div>
                                                <div style={{ fontSize: '1.6rem', fontWeight: 800, color: '#8B5CF6' }}>
                                                    {formatNumber(ytdData.reduce((s, m) => s + m.orders, 0))}
                                                </div>
                                            </div>
                                        </div>
                                    ) : (
                                        <div style={{ color: '#94A3B8', fontSize: '0.85rem', padding: '1rem 0' }}>No data for current year.</div>
                                    )}
                                </div>
                            </div>
                        );
                    })()}

                    <div className="dashboard-card" style={{ marginBottom: '20px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px', flexWrap: 'wrap', gap: '10px' }}>
                            <h3 style={{ fontSize: '1rem', color: '#1E293B', margin: 0 }}>
                                Revenue Trend
                            </h3>
                            <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                                {[
                                    { value: 'today', label: 'Today' },
                                    { value: 'past7', label: 'Past 7 Days' },
                                    { value: 'thisWeek', label: 'This Week' },
                                    { value: 'past30', label: 'Past 30 Days' },
                                    { value: 'thisMonth', label: 'This Month' },
                                    { value: 'thisYear', label: 'This Year' },
                                    { value: 'past365', label: 'Past 365 Days' }
                                ].map(period => (
                                    <button
                                        key={period.value}
                                        onClick={() => setTrendPeriod(period.value)}
                                        style={{
                                            padding: '4px 10px',
                                            borderRadius: '4px',
                                            border: trendPeriod === period.value ? '1px solid #4880FF' : '1px solid #E2E8F0',
                                            fontSize: '0.75rem',
                                            color: trendPeriod === period.value ? '#4880FF' : '#64748B',
                                            background: trendPeriod === period.value ? '#F0F4FF' : '#fff',
                                            cursor: 'pointer',
                                            fontWeight: trendPeriod === period.value ? 600 : 500,
                                            transition: 'all 0.2s ease',
                                            whiteSpace: 'nowrap'
                                        }}
                                    >
                                        {period.label}
                                    </button>
                                ))}
                            </div>
                        </div>
                        <ResponsiveContainer width="100%" height={350}>
                            <ComposedChart data={trends.monthlyRevenue}>
                                <defs>
                                    <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="#4880FF" stopOpacity={0.2} />
                                        <stop offset="95%" stopColor="#4880FF" stopOpacity={0} />
                                    </linearGradient>
                                </defs>
                                <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                                <XAxis 
                                    dataKey="period" 
                                    tick={{ fill: '#64748B', fontSize: 11 }}
                                    angle={trends.monthlyRevenue?.length > 15 ? -45 : 0}
                                    textAnchor={trends.monthlyRevenue?.length > 15 ? 'end' : 'middle'}
                                    height={trends.monthlyRevenue?.length > 15 ? 80 : 30}
                                />
                                <YAxis yAxisId="left" tick={{ fill: '#64748B', fontSize: 11 }} />
                                <YAxis yAxisId="right" orientation="right" tick={{ fill: '#64748B', fontSize: 11 }} />
                                <Tooltip 
                                    formatter={(value, name) => {
                                        if (name === 'Revenue') return formatCurrency(value);
                                        return formatNumber(value);
                                    }} 
                                    contentStyle={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: '6px' }}
                                />
                                <Legend />
                                <Area 
                                    yAxisId="left"
                                    type="monotone" 
                                    dataKey="totalRevenue" 
                                    fill="url(#colorRevenue)" 
                                    stroke="#4880FF" 
                                    name="Revenue"
                                />
                                <Line 
                                    yAxisId="right"
                                    type="monotone" 
                                    dataKey="orderCount" 
                                    stroke="#10B981" 
                                    strokeWidth={2}
                                    name="Orders"
                                    dot={{ fill: '#10B981', r: 4 }}
                                />
                            </ComposedChart>
                        </ResponsiveContainer>
                    </div>

                        <div className="dashboard-card" style={{ marginBottom: '20px' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
                                <h3 style={{ fontSize: '1rem', color: '#1E293B', margin: 0 }}>Period Summary</h3>
                                {trends.monthlyRevenue?.length > 0 && (
                                    <ExportButton
                                        data={trends.monthlyRevenue.map(m => ({
                                            period: m.period || '',
                                            orders: m.orderCount || 0,
                                            revenue: parseFloat((m.totalRevenue || 0).toFixed(2))
                                        }))}
                                        columns={[
                                            { key: 'period', label: 'Period' },
                                            { key: 'orders', label: 'Orders' },
                                            { key: 'revenue', label: `Revenue (${symbol})` }
                                        ]}
                                        filename={`revenue-trends-${new Date().toISOString().split('T')[0]}`}
                                        label="Export"
                                    />
                                )}
                            </div>
                            <div style={{ overflowX: 'auto', maxHeight: '400px' }}>
                                <table className="data-table">
                                    <thead>
                                        <tr>
                                            <th>Period</th>
                                            <th>Orders</th>
                                            <th>Revenue</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {trends.monthlyRevenue.slice().reverse().map((month, idx) => (
                                            <tr key={idx}>
                                                <td><strong>{month.period}</strong></td>
                                                <td>{formatNumber(month.orderCount)}</td>
                                                <td style={{ color: '#10B981', fontWeight: 600 }}>
                                                    {formatCurrency(month.totalRevenue)}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>

                        <div className="dashboard-card">
                            <h3 style={{ marginBottom: '15px', fontSize: '1rem', color: '#1E293B' }}>Trend Insights</h3>
                            <div style={{ padding: '12px', background: '#F8FAFC', borderRadius: '6px', marginBottom: '12px' }}>
                                <div style={{ fontSize: '0.85rem', color: '#64748B', marginBottom: '8px' }}>
                                    Average Revenue per Period
                                </div>
                                <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#1E293B' }}>
                                    {formatCurrency(
                                        trends.monthlyRevenue.reduce((sum, m) => sum + m.totalRevenue, 0) / 
                                        (trends.monthlyRevenue.length || 1)
                                    )}
                                </div>
                            </div>
                            <div style={{ padding: '12px', background: '#F8FAFC', borderRadius: '6px', marginBottom: '12px' }}>
                                <div style={{ fontSize: '0.85rem', color: '#64748B', marginBottom: '8px' }}>
                                    Average Orders per Period
                                </div>
                                <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#1E293B' }}>
                                    {formatNumber(
                                        Math.round(
                                            trends.monthlyRevenue.reduce((sum, m) => sum + m.orderCount, 0) / 
                                            (trends.monthlyRevenue.length || 1)
                                        )
                                    )}
                                </div>
                            </div>
                            <div style={{ padding: '12px', background: '#F8FAFC', borderRadius: '6px' }}>
                                <div style={{ fontSize: '0.85rem', color: '#64748B', marginBottom: '8px' }}>
                                    Best Period
                                </div>
                                <div style={{ fontSize: '1.25rem', fontWeight: 'bold', color: '#10B981' }}>
                                    {trends.monthlyRevenue.length > 0 
                                        ? trends.monthlyRevenue.reduce((max, m) => 
                                            m.totalRevenue > max.totalRevenue ? m : max
                                        ).period
                                        : 'N/A'
                                    }
                                </div>
                            </div>
                        </div>
                    
                </div>
            )}
        </div>
    );
};

export default Financials;
