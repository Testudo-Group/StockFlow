import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useCountry } from '../context/CountryContext';
import { useNavigate } from 'react-router-dom';
import {
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';
import { FiShoppingCart, FiAward, FiTarget, FiActivity, FiUser } from 'react-icons/fi';
import api from '../utils/api';
import Spinner from '../components/Spinner';
import ExportButton from '../components/ExportButton';
import useCurrency from '../hooks/useCurrency';

const Dashboard = () => {
    const { user } = useAuth();
    const { activeCountry } = useCountry();
    const { formatShort, symbol } = useCurrency();
    const navigate = useNavigate();
    const [loading, setLoading] = useState(true);
    const [trendPeriod, setTrendPeriod] = useState('past30'); // Changed from trendDays
    const [burnRateFilter, setBurnRateFilter] = useState('all'); // all, fast, moderate, slow, stagnant
    const [stats, setStats] = useState({
        summary: {
            totalOrders: 0,
            topSellingBrand: '...',
            topProductQty: '...',
            topProductValue: '...'
        },
        warehouseCBM: [],
        dispatchTrends: [],
        topCustomers: [],
        burnRateData: []
    });

    // Time period options
    const timePeriods = [
        { value: 'today', label: 'Today', days: 1 },
        { value: 'past7', label: 'Past 7 Days', days: 7 },
        { value: 'thisWeek', label: 'This Week', days: 'thisWeek' },
        { value: 'past30', label: 'Past 30 Days', days: 30 },
        { value: 'thisMonth', label: 'This Month', days: 'thisMonth' },
        { value: 'thisYear', label: 'This Year', days: 'thisYear' },
        { value: 'past365', label: 'Past 365 Days', days: 365 }
    ];

    const fetchDashboardData = async (period) => {
        try {
            setLoading(true);
            const selectedPeriod = timePeriods.find(p => p.value === period);
            const countryParam = activeCountry?._id ? `&countryId=${activeCountry._id}` : '';
            const response = await api.get(`/analytics?period=${period}&days=${selectedPeriod.days}${countryParam}`);
            setStats(response.data.data);
            setLoading(false);
        } catch (error) {
            console.error("Error fetching dashboard data:", error);
            setLoading(false);
        }
    };

    useEffect(() => {
        if (activeCountry?._id) {
            fetchDashboardData(trendPeriod);
        }
    }, [trendPeriod, activeCountry?._id]);

    if (loading && stats.summary.totalOrders === 0) return <Spinner fullPage />;

    // Filter burn rate data
    const filteredBurnRate = (stats.burnRateData || []).filter(item => {
        if (burnRateFilter === 'all') return true;
        return item.burnRateCategory === burnRateFilter.toUpperCase();
    });

    const burnRateCounts = {
        fast: (stats.burnRateData || []).filter(i => i.burnRateCategory === 'FAST').length,
        moderate: (stats.burnRateData || []).filter(i => i.burnRateCategory === 'MODERATE').length,
        slow: (stats.burnRateData || []).filter(i => i.burnRateCategory === 'SLOW').length,
        stagnant: (stats.burnRateData || []).filter(i => i.burnRateCategory === 'STAGNANT').length
    };

    const statCards = [
        {
            title: 'Total Orders',
            value: stats.summary.totalOrders.toLocaleString(),
            icon: <FiShoppingCart />,
            trend: '12%',
            trendUp: true,
            color: '#4880FF',
        },
        {
            title: 'Top Brand',
            value: stats.summary.topSellingBrand,
            icon: <FiAward />,
            trend: '8%',
            trendUp: true,
            color: '#10b981',
        },
        {
            title: 'Top Product (Qty)',
            value: stats.summary.topProductQty,
            icon: <FiTarget />,
            trend: '24%',
            trendUp: false,
            color: '#f59e0b',
        },
        {
            title: 'Top Product (Value)',
            value: stats.summary.topProductValue,
            icon: <FiActivity />,
            trend: '16%',
            trendUp: true,
            color: '#ef4444',
        }
    ];

    return (
        <div className="dashboard-wrapper">
            {/* Header */}
            <div className="dash-header">
                <h1>Dashboard Overview</h1>
                {activeCountry && (
                    <span style={{ fontSize: '0.8rem', fontWeight: 600, background: '#F0F4FF', color: '#4880FF', padding: '4px 12px', borderRadius: '20px', border: '1px solid #D1DEFF' }}>
                        🌍 {activeCountry.name}
                    </span>
                )}
            </div>

            {/* Stat Cards Row */}
            <div className="stat-cards-row">
                {statCards.map((card, i) => (
                    <div className="stat-card" key={i}>
                        <div className="stat-card-icon">
                            {card.icon}
                        </div>
                        <div className="stat-card-label">{card.title}</div>
                        <div className="stat-card-bottom">
                            <span className="stat-card-value">{card.value}</span>
                            <span className={`stat-card-trend ${card.trendUp ? 'up' : 'down'}`}>
                                {card.trendUp ? '↑' : '↓'} {card.trend}
                            </span>
                        </div>
                    </div>
                ))}
            </div>

            {/* Middle Row: CBM and Dispatch Trends */}
            <div className="charts-row">
                {/* Warehouse CBM Volume */}
                <div className="chart-card">
                    <div className="chart-card-header">
                        <h3>Warehouse Volume (CBM)</h3>
                    </div>
                    <div className="chart-body">
                        <ResponsiveContainer width="100%" height={260}>
                            <BarChart data={stats.warehouseCBM} layout="vertical" barCategoryGap="20%">
                                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#E9EDF5" />
                                <XAxis type="number" axisLine={false} tickLine={false} tick={{ fill: '#A3AED0', fontSize: 11 }} />
                                <YAxis dataKey="name" type="category" width={110} axisLine={false} tickLine={false} tick={{ fill: '#1E2640', fontSize: 11, fontWeight: 500 }} />
                                <Tooltip />
                                <Bar dataKey="value" fill="#4880FF" radius={[0, 4, 4, 0]} barSize={14} />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </div>

                {/* Dispatch Trends */}
                <div className="chart-card">
                    <div className="chart-card-header">
                        <h3>Dispatch Trends</h3>
                        <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                            {timePeriods.map(period => (
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
                                    onMouseEnter={(e) => {
                                        if (trendPeriod !== period.value) {
                                            e.target.style.borderColor = '#CBD5E1';
                                            e.target.style.background = '#F8FAFC';
                                        }
                                    }}
                                    onMouseLeave={(e) => {
                                        if (trendPeriod !== period.value) {
                                            e.target.style.borderColor = '#E2E8F0';
                                            e.target.style.background = '#fff';
                                        }
                                    }}
                                >
                                    {period.label}
                                </button>
                            ))}
                        </div>
                    </div>
                    <div className="chart-body">
                        <ResponsiveContainer width="100%" height={260}>
                            <BarChart data={stats.dispatchTrends}>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E9EDF5" />
                                <XAxis 
                                    dataKey="date" 
                                    axisLine={false} 
                                    tickLine={false} 
                                    tick={{ fill: '#A3AED0', fontSize: 10 }} 
                                    hide={stats.dispatchTrends?.length > 31}
                                    angle={stats.dispatchTrends?.length > 15 ? -45 : 0}
                                    textAnchor={stats.dispatchTrends?.length > 15 ? 'end' : 'middle'}
                                    height={stats.dispatchTrends?.length > 15 ? 60 : 30}
                                />
                                <YAxis axisLine={false} tickLine={false} tick={{ fill: '#A3AED0', fontSize: 11 }} />
                                <Tooltip />
                                <Bar dataKey="orders" fill="#10b981" radius={[4, 4, 0, 0]} barSize={12} />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </div>
            </div>

            {/* Bottom Row: Top Customers */}
            <div className="chart-card">
                <div className="chart-card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                        <h3>Top Customers</h3>
                        <span className="text-secondary" style={{ fontSize: '0.8rem' }}>By Sales Value</span>
                    </div>
                    {stats.topCustomers?.length > 0 && (
                        <ExportButton
                            data={stats.topCustomers.map(c => ({
                                customerName: c._id || '',
                                orderCount: c.orderCount || 0,
                                totalSpent: parseFloat((c.totalSpent || 0).toFixed(2)),
                                lastOrder: new Date(c.lastOrder).toLocaleDateString()
                            }))}
                            columns={[
                                { key: 'customerName', label: 'Customer Name' },
                                { key: 'orderCount', label: 'Orders' },
                                { key: 'totalSpent', label: `Total Spent (${symbol})` },
                                { key: 'lastOrder', label: 'Last Order' }
                            ]}
                            filename={`top-customers-${new Date().toISOString().split('T')[0]}`}
                            label="Export"
                        />
                    )}
                </div>
                <div className="table-container" style={{ border: 'none', boxShadow: 'none', padding: 0 }}>
                    <table className="data-table">
                        <thead>
                            <tr>
                                <th>Customer Name</th>
                                <th>Orders</th>
                                <th>Total Spent</th>
                                <th>Last Order</th>
                            </tr>
                        </thead>
                        <tbody>
                            {stats.topCustomers?.length > 0 ? (
                                stats.topCustomers.map((customer, idx) => (
                                    <tr key={idx} style={{ cursor: 'pointer' }} onClick={() => navigate(`/orders?customer=${customer._id}`)}>
                                        <td>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                <div style={{ width: 28, height: 28, borderRadius: '50%', background: '#F0F4FF', color: '#4880FF', display: 'flex', alignItems: 'center', justifyCenter: 'center', fontSize: '0.8rem', fontWeight: 600 }}>
                                                    <FiUser style={{ margin: 'auto' }} />
                                                </div>
                                                <span style={{ fontWeight: 500 }}>{customer._id}</span>
                                            </div>
                                        </td>
                                        <td>{customer.orderCount}</td>
                                        <td style={{ fontWeight: 600, color: '#1E2640' }}>{formatShort(customer.totalSpent || 0)}</td>
                                        <td style={{ color: '#6B7A99' }}>{new Date(customer.lastOrder).toLocaleDateString()}</td>
                                    </tr>
                                ))
                            ) : (
                                <tr>
                                    <td colSpan="4" className="text-center" style={{ color: '#A3AED0', fontStyle: 'italic', padding: '2rem' }}>
                                        No customer data available
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Burn Rate Analysis */}
            <div className="chart-card">
                <div className="chart-card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem' }}>
                    <div style={{ flex: 1 }}>
                        <h3>Stock Movement Analysis</h3>
                        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginTop: '8px' }}>
                            {[
                                { value: 'all', label: 'All', count: stats.burnRateData?.length || 0, color: '#64748B' },
                                { value: 'fast', label: 'Fast Moving', count: burnRateCounts.fast, color: '#10B981' },
                                { value: 'moderate', label: 'Moderate', count: burnRateCounts.moderate, color: '#F59E0B' },
                                { value: 'slow', label: 'Slow Moving', count: burnRateCounts.slow, color: '#EF4444' },
                                { value: 'stagnant', label: 'Stagnant', count: burnRateCounts.stagnant, color: '#94A3B8' }
                            ].map(filter => (
                                <button
                                    key={filter.value}
                                    onClick={() => setBurnRateFilter(filter.value)}
                                    style={{
                                        padding: '4px 10px',
                                        border: burnRateFilter === filter.value ? `2px solid ${filter.color}` : '1px solid #E2E8F0',
                                        background: burnRateFilter === filter.value ? `${filter.color}15` : '#fff',
                                        color: filter.color,
                                        borderRadius: '6px',
                                        fontSize: '0.75rem',
                                        fontWeight: burnRateFilter === filter.value ? 600 : 500,
                                        cursor: 'pointer',
                                        transition: 'all 0.2s'
                                    }}
                                >
                                    {filter.label} ({filter.count})
                                </button>
                            ))}
                        </div>
                    </div>
                    {filteredBurnRate.length > 0 && (
                        <ExportButton
                            data={filteredBurnRate.map(item => ({
                                sku: item.sku || '',
                                productName: item.productName || '',
                                brand: item.brand || '',
                                currentStock: item.currentStock || 0,
                                totalSold: item.totalSold || 0,
                                dailySalesRate: item.dailySalesRate || 0,
                                daysUntilStockout: item.daysUntilStockout > 999 ? 'Infinite' : item.daysUntilStockout,
                                status: item.burnRateCategory || ''
                            }))}
                            columns={[
                                { key: 'sku', label: 'SKU' },
                                { key: 'productName', label: 'Product' },
                                { key: 'brand', label: 'Brand' },
                                { key: 'currentStock', label: 'Current Stock' },
                                { key: 'totalSold', label: 'Sold (30 days)' },
                                { key: 'dailySalesRate', label: 'Daily Sales Rate' },
                                { key: 'daysUntilStockout', label: 'Days Until Stockout' },
                                { key: 'status', label: 'Status' }
                            ]}
                            filename={`stock-movement-${new Date().toISOString().split('T')[0]}`}
                            label="Export"
                        />
                    )}
                </div>
                <div style={{ fontSize: '0.75rem', color: '#64748B', padding: '0 1.5rem 1rem', borderBottom: '1px solid #E2E8F0' }}>
                    Based on last 30 days sales velocity. Fast: &lt;30 days stock, Moderate: 30-90 days, Slow: &gt;90 days, Stagnant: No sales
                </div>
                <div className="table-container" style={{ border: 'none', boxShadow: 'none', padding: 0 }}>
                    <table className="data-table">
                        <thead>
                            <tr>
                                <th>SKU</th>
                                <th>Product</th>
                                <th>Brand</th>
                                <th>Current Stock</th>
                                <th>Sold (30d)</th>
                                <th>Daily Rate</th>
                                <th>Days Until Stockout</th>
                                <th>Status</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filteredBurnRate.length > 0 ? (
                                filteredBurnRate.slice(0, 10).map((item, idx) => {
                                    const statusConfig = {
                                        FAST: { bg: '#D1FAE5', color: '#065F46', label: 'Fast Moving' },
                                        MODERATE: { bg: '#FEF3C7', color: '#92400E', label: 'Moderate' },
                                        SLOW: { bg: '#FEE2E2', color: '#991B1B', label: 'Slow Moving' },
                                        STAGNANT: { bg: '#F1F5F9', color: '#475569', label: 'Stagnant' }
                                    };
                                    const status = statusConfig[item.burnRateCategory] || statusConfig.STAGNANT;
                                    
                                    return (
                                        <tr key={idx}>
                                            <td><span style={{ fontFamily: 'monospace', fontSize: '0.85rem', color: '#64748B' }}>{item.sku}</span></td>
                                            <td style={{ fontWeight: 500 }}>{item.productName}</td>
                                            <td>{item.brand}</td>
                                            <td><span style={{ fontWeight: 600 }}>{item.currentStock?.toLocaleString() || 0}</span></td>
                                            <td><span style={{ color: '#10B981', fontWeight: 600 }}>{item.totalSold?.toLocaleString() || 0}</span></td>
                                            <td><span style={{ color: '#4880FF', fontWeight: 600 }}>{item.dailySalesRate || 0}</span> /day</td>
                                            <td>
                                                <span style={{ 
                                                    fontWeight: 600,
                                                    color: item.daysUntilStockout < 30 ? '#DC2626' : item.daysUntilStockout < 90 ? '#F59E0B' : '#64748B'
                                                }}>
                                                    {item.daysUntilStockout > 999 ? '∞' : `${item.daysUntilStockout} days`}
                                                </span>
                                            </td>
                                            <td>
                                                <span style={{
                                                    padding: '4px 12px',
                                                    borderRadius: '4px',
                                                    fontSize: '0.75rem',
                                                    fontWeight: 600,
                                                    background: status.bg,
                                                    color: status.color
                                                }}>
                                                    {status.label}
                                                </span>
                                            </td>
                                        </tr>
                                    );
                                })
                            ) : (
                                <tr>
                                    <td colSpan="8" className="text-center" style={{ color: '#A3AED0', fontStyle: 'italic', padding: '2rem' }}>
                                        No stock movement data available
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                    {filteredBurnRate.length > 10 && (
                        <div style={{ padding: '1rem', textAlign: 'center', borderTop: '1px solid #E2E8F0', fontSize: '0.875rem', color: '#64748B' }}>
                            Showing top 10 of {filteredBurnRate.length} products. View full analysis in Operational Insights.
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default Dashboard;
