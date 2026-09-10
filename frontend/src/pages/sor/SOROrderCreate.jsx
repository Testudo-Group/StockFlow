import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'react-toastify';
import { FiPlus, FiTrash2 } from 'react-icons/fi';
import api from '../../utils/api';
import Spinner from '../../components/Spinner';
import { useCountry } from '../../context/CountryContext';
import useCurrency from '../../hooks/useCurrency';

// Reused from OrderCreate — searchable product dropdown
const ProductSearchSelect = ({ value, options, onChange, placeholder }) => {
    const [isOpen, setIsOpen] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedProduct, setSelectedProduct] = useState(null);
    const containerRef = useRef(null);

    useEffect(() => {
        if (value) {
            const prod = options.find(p => p._id === value);
            setSelectedProduct(prod);
            setSearchTerm(prod ? `${prod.name} (${prod.sku})` : '');
        } else {
            setSelectedProduct(null);
            setSearchTerm('');
        }
    }, [value, options]);

    useEffect(() => {
        const handleClickOutside = (e) => {
            if (containerRef.current && !containerRef.current.contains(e.target)) {
                setIsOpen(false);
                if (selectedProduct) setSearchTerm(`${selectedProduct.name} (${selectedProduct.sku})`);
                else setSearchTerm('');
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [selectedProduct]);

    const filtered = options.filter(p =>
        p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        p.sku.toLowerCase().includes(searchTerm.toLowerCase())
    );

    return (
        <div className="search-select-container" ref={containerRef} style={{ position: 'relative' }}>
            <input
                type="text"
                className="search-select-input"
                placeholder={placeholder}
                value={searchTerm}
                onChange={e => { if (!selectedProduct) { setSearchTerm(e.target.value); setIsOpen(true); } }}
                onFocus={() => { if (!selectedProduct) setIsOpen(true); }}
                readOnly={!!selectedProduct}
                style={{ paddingRight: selectedProduct ? '35px' : '10px' }}
            />
            {selectedProduct && (
                <button type="button" onClick={() => { onChange(''); setSelectedProduct(null); setSearchTerm(''); setIsOpen(true); }}
                    style={{ position: 'absolute', right: '8px', top: '50%', transform: 'translateY(-50%)', background: 'transparent', border: 'none', cursor: 'pointer', color: '#666', fontSize: '18px', padding: '0 5px', lineHeight: '1' }}
                    title="Change product">×</button>
            )}
            {isOpen && !selectedProduct && (
                <div className="search-select-dropdown">
                    {filtered.length > 0 ? filtered.map(p => (
                        <div key={p._id} className={`search-select-option ${p._id === value ? 'active' : ''}`}
                            onClick={e => { e.stopPropagation(); onChange(p._id); setIsOpen(false); }}>
                            <span className="p-name">{p.name}</span>
                            <span className="p-sku">{p.sku}</span>
                        </div>
                    )) : <div className="search-select-no-results">No products found</div>}
                </div>
            )}
        </div>
    );
};

const SOROrderCreate = () => {
    const navigate = useNavigate();
    const { activeCountry } = useCountry();
    const { format, symbol } = useCurrency();
    const formatCurrency = (n) => format(Number(n || 0));
    const [loading, setLoading] = useState(false);

    // Reference data
    const [sorCustomers, setSorCustomers] = useState([]);
    const [templates, setTemplates] = useState([]);
    const [products, setProducts] = useState([]);
    const [regions, setRegions] = useState([]);
    const [warehouses, setWarehouses] = useState([]);

    // Selections
    const [selectedCustomer, setSelectedCustomer] = useState('');
    const [selectedTemplate, setSelectedTemplate] = useState('');
    const [orderType, setOrderType] = useState('RETAIL');
    const [deliveryFee, setDeliveryFee] = useState(0);
    const [discountAmount, setDiscountAmount] = useState(0);
    const [applyDiscount, setApplyDiscount] = useState(false);

    const [formData, setFormData] = useState({
        region: '',
        warehouse: '',
        channel: 'Other',
        items: [], // { product, quantity, price }
    });

    // Load SOR customers and regions on mount
    useEffect(() => {
        if (!activeCountry?._id) return;
        const countryParam = `?countryId=${activeCountry._id}`;
        Promise.all([
            api.get(`/sor/customers?limit=500&countryId=${activeCountry._id}`),
            api.get(`/regions${countryParam}`),
            api.get(`/products?limit=500&countryId=${activeCountry._id}`),
        ]).then(([custRes, regRes, prodRes]) => {
            setSorCustomers(custRes.data.data || []);
            setRegions(regRes.data.data || []);
            setProducts((prodRes.data.data || []).filter(p => p.status === 'ACTIVE'));
        }).catch(() => toast.error('Failed to load form data'));
    }, [activeCountry?._id]);

    // Load templates when customer changes
    useEffect(() => {
        if (!selectedCustomer) { setTemplates([]); setSelectedTemplate(''); return; }
        api.get(`/sor/templates?customer=${selectedCustomer}`)
            .then(res => setTemplates(res.data.data || []))
            .catch(() => setTemplates([]));
    }, [selectedCustomer]);

    // Update warehouses when region changes
    useEffect(() => {
        if (formData.region) {
            const region = regions.find(r => r._id === formData.region);
            setWarehouses(region ? region.warehouses : []);
        } else {
            setWarehouses([]);
        }
    }, [formData.region, regions]);

    const handleTemplateSelect = (templateId) => {
        setSelectedTemplate(templateId);
        if (!templateId) return;
        const tpl = templates.find(t => t._id === templateId);
        if (!tpl) return;

        const items = (tpl.items || []).map(item => {
            const product = products.find(p => p._id === (item.product?._id || item.product));
            return {
                product: item.product?._id || item.product,
                quantity: item.quantity || 1,
                price: product ? (orderType === 'WHOLESALE' ? (product.wholesaleCost || 0) : (product.price || 0)) : 0,
                discount: 0,
            };
        });

        setFormData(prev => ({
            ...prev,
            region: tpl.region?._id || tpl.region || prev.region,
            warehouse: tpl.warehouse?._id || tpl.warehouse || prev.warehouse,
            items,
        }));
        toast.info(`Loaded template: ${tpl.name}`);
    };

    const addItem = () => {
        setFormData(prev => ({
            ...prev,
            items: [...prev.items, { product: '', quantity: 1, price: 0, discount: 0 }],
        }));
    };

    const removeItem = (idx) => {
        setFormData(prev => ({ ...prev, items: prev.items.filter((_, i) => i !== idx) }));
    };

    const updateItem = (idx, field, value) => {
        setFormData(prev => {
            const items = [...prev.items];
            items[idx] = { ...items[idx], [field]: value };
            if (field === 'product') {
                const product = products.find(p => p._id === value);
                if (product) {
                    items[idx].price = orderType === 'WHOLESALE' ? (product.wholesaleCost || 0) : (product.price || 0);
                    items[idx].discount = 0;
                }
            }
            return { ...prev, items };
        });
    };

    const handleOrderTypeChange = (type) => {
        setOrderType(type);
        setFormData(prev => ({
            ...prev,
            items: prev.items.map(item => {
                const product = products.find(p => p._id === item.product);
                if (!product) return item;
                return { ...item, price: type === 'WHOLESALE' ? (product.wholesaleCost || 0) : (product.price || 0), discount: 0 };
            }),
        }));
    };

    const calcSubtotal = () =>
        formData.items.reduce((acc, item) => {
            const effectivePrice = Math.max(0, (item.price || 0) - (item.discount || 0));
            return acc + (item.quantity || 0) * effectivePrice;
        }, 0);

    const calcItemDiscount = (item) => (item.discount || 0) * (item.quantity || 0);
    const calcTotalItemDiscounts = () => formData.items.reduce((acc, item) => acc + calcItemDiscount(item), 0);

    const calcTotal = () => {
        const sub = calcSubtotal();
        const afterDiscount = applyDiscount ? Math.max(0, sub - discountAmount) : sub;
        return afterDiscount + (deliveryFee || 0);
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!selectedCustomer) return toast.error('Please select a customer');
        if (formData.items.length === 0) return toast.error('Add at least one item');

        const invalidItem = formData.items.find(i => !i.product || !i.quantity || i.quantity < 1);
        if (invalidItem) return toast.error('Each item must have a product and quantity ≥ 1');

        setLoading(true);
        try {
            const subtotal = calcSubtotal();
            const finalDiscountAmount = applyDiscount ? discountAmount : 0;
            const finalDiscountType = applyDiscount && discountAmount > 0 ? 'global' : 'none';

            const payload = {
                customer: selectedCustomer,
                region: formData.region,
                warehouse: formData.warehouse,
                channel: formData.channel,
                orderType,
                items: formData.items.map(i => ({
                    product: i.product,
                    quantity: i.quantity,
                    price: Math.max(0, (i.price || 0) - (i.discount || 0)),
                })),
                subtotal,
                discountAmount: finalDiscountAmount,
                discountType: finalDiscountType,
                deliveryFee: deliveryFee || 0,
                ...(activeCountry?._id && { countryId: activeCountry._id }),
            };

            await api.post('/sor/orders', payload);
            toast.success('SOR order created successfully');
            navigate(`/sor/customers/${selectedCustomer}`);
        } catch (err) {
            toast.error(err.response?.data?.message || err.message || 'Failed to create order');
        } finally {
            setLoading(false);
        }
    };

    const selectedCustomerObj = sorCustomers.find(c => c._id === selectedCustomer);

    return (
        <div className="page-container">
            <div className="page-header">
                <h1>New SOR Order</h1>
            </div>

            {/* Order Type */}
            <div style={{ background: '#F7FAFC', padding: '16px 24px', borderRadius: '8px', marginBottom: '20px', border: '1px solid #E2E8F0', display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '16px', maxWidth: '1200px', margin: '0 auto 20px auto' }}>
                <span style={{ fontSize: '14px', fontWeight: 600, color: '#2D3748' }}>Order Type:</span>
                <div style={{ display: 'flex', gap: '8px' }}>
                    {['RETAIL', 'WHOLESALE'].map(type => (
                        <button key={type} type="button" onClick={() => handleOrderTypeChange(type)}
                            style={{ padding: '8px 20px', borderRadius: '6px', border: orderType === type ? '2px solid #4880FF' : '1px solid #CBD5E0', background: orderType === type ? '#4880FF' : 'white', color: orderType === type ? 'white' : '#4A5568', fontWeight: orderType === type ? 600 : 400, cursor: 'pointer', fontSize: '14px', transition: 'all 0.2s', minWidth: '140px' }}>
                            {type === 'RETAIL' ? 'Retail Price' : 'Wholesale Price'}
                        </button>
                    ))}
                </div>
                <span style={{ fontSize: '12px', color: '#718096', marginLeft: 'auto' }}>
                    {orderType === 'RETAIL' ? 'Using retail prices' : 'Using wholesale prices'}
                </span>
            </div>

            <form onSubmit={handleSubmit} style={{ maxWidth: '1200px', margin: '0 auto' }}>

                {/* Customer + Template */}
                <div className="card mb-xl" style={{ marginBottom: '1rem' }}>
                    <h3 className="mb-lg border-bottom pb-sm">Customer</h3>
                    <div className="form-row">
                        <div className="form-group">
                            <label>SOR Customer <span style={{ color: '#e53e3e' }}>*</span></label>
                            <select value={selectedCustomer} onChange={e => { setSelectedCustomer(e.target.value); setSelectedTemplate(''); setFormData(prev => ({ ...prev, items: [] })); }} required>
                                <option value="">Select customer...</option>
                                {sorCustomers.map(c => (
                                    <option key={c._id} value={c._id}>{c.name} — {c.phone}</option>
                                ))}
                            </select>
                        </div>

                        {selectedCustomer && (
                            <div className="form-group">
                                <label>Load from Template (optional)</label>
                                <select value={selectedTemplate} onChange={e => handleTemplateSelect(e.target.value)}>
                                    <option value="">No template — manual entry</option>
                                    {templates.map(t => (
                                        <option key={t._id} value={t._id}>{t.name}</option>
                                    ))}
                                </select>
                            </div>
                        )}
                    </div>

                    {selectedCustomerObj && (
                        <div style={{ background: '#EBF8FF', border: '1px solid #BEE3F8', borderRadius: '6px', padding: '10px 14px', fontSize: '13px', color: '#2C5282', marginTop: '8px' }}>
                            <strong>{selectedCustomerObj.name}</strong> · {selectedCustomerObj.phone} · {selectedCustomerObj.address}
                        </div>
                    )}
                </div>

                {/* Fulfillment */}
                <div className="card mb-xl" style={{ marginBottom: '1rem' }}>
                    <h3 className="mb-lg border-bottom pb-sm">Fulfillment Center</h3>
                    <div className="form-row">
                        <div className="form-group">
                            <label>Region <span style={{ color: '#e53e3e' }}>*</span></label>
                            <select value={formData.region} onChange={e => setFormData(prev => ({ ...prev, region: e.target.value, warehouse: '' }))} required>
                                <option value="">Select Region...</option>
                                {regions.map(r => <option key={r._id} value={r._id}>{r.name}</option>)}
                            </select>
                        </div>
                        <div className="form-group">
                            <label>Warehouse <span style={{ color: '#e53e3e' }}>*</span></label>
                            <select value={formData.warehouse} onChange={e => setFormData(prev => ({ ...prev, warehouse: e.target.value }))} required disabled={!formData.region}>
                                <option value="">Select Warehouse...</option>
                                {warehouses.map(w => <option key={w._id} value={w._id}>{w.name}</option>)}
                            </select>
                        </div>
                    </div>
                    <div className="form-group">
                        <label>Channel</label>
                        <select value={formData.channel} onChange={e => setFormData(prev => ({ ...prev, channel: e.target.value }))}>
                            {['Instagram', 'Google', 'Facebook', 'Referral', 'Walk-in', 'Other'].map(ch => (
                                <option key={ch} value={ch}>{ch}</option>
                            ))}
                        </select>
                    </div>
                </div>

                {/* Order Items */}
                <div className="card mb-xl" style={{ marginBottom: '1rem' }}>
                    <h3 className="mb-lg border-bottom pb-sm">Order Items</h3>

                    {/* Discount control */}
                    <div style={{ background: '#FFFBEB', padding: '12px 16px', borderRadius: '6px', marginBottom: '16px', border: '1px solid #FDE68A', display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                        <button type="button" onClick={() => setApplyDiscount(!applyDiscount)}
                            style={{ padding: '6px 16px', borderRadius: '6px', border: applyDiscount ? '2px solid #F59E0B' : '1px solid #FCD34D', background: applyDiscount ? '#F59E0B' : 'white', color: applyDiscount ? 'white' : '#92400E', fontWeight: 600, cursor: 'pointer', fontSize: '13px', transition: 'all 0.2s' }}>
                            {applyDiscount ? '✓ Discount Applied' : '+ Apply Discount'}
                        </button>
                        {applyDiscount && (
                            <>
                                <label style={{ fontSize: '13px', color: '#92400E', fontWeight: 500 }}>Total Discount:</label>
                                <input type="number" min="0" value={discountAmount || ''} onChange={e => setDiscountAmount(parseFloat(e.target.value) || 0)} placeholder="0"
                                    onWheel={e => e.target.blur()}
                                    style={{ width: '120px', padding: '4px 8px', borderRadius: '5px', border: '1px solid #FCD34D', fontSize: '13px' }} />
                                <span style={{ fontSize: '11px', color: '#78350F' }}>{symbol} off total order</span>
                            </>
                        )}
                    </div>

                    {/* Delivery fee */}
                    <div style={{ background: '#F0F9FF', padding: '12px 16px', borderRadius: '6px', marginBottom: '16px', border: '1px solid #BAE6FD', display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                        <label style={{ fontSize: '13px', color: '#0C4A6E', fontWeight: 600 }}>Delivery Fee:</label>
                        <input type="number" min="0" value={deliveryFee || ''} onChange={e => setDeliveryFee(parseFloat(e.target.value) || 0)} placeholder="0"
                            onWheel={e => e.target.blur()}
                            style={{ width: '140px', padding: '6px 12px', borderRadius: '5px', border: '1px solid #BAE6FD', fontSize: '13px' }} />
                        <span style={{ fontSize: '12px', color: '#0369A1' }}>{symbol} (optional)</span>
                    </div>

                    {/* Item rows */}
                    {formData.items.map((item, idx) => (
                        <div key={idx} style={{ paddingBottom: '1rem', borderBottom: '1px solid #eee', marginBottom: '1rem' }}>
                            <div style={{ display: 'flex', gap: '1rem', alignItems: 'flex-end', flexWrap: 'wrap' }}>
                                <div className="form-group" style={{ flex: 2, minWidth: '220px' }}>
                                    <label>Product</label>
                                    <ProductSearchSelect
                                        value={item.product}
                                        options={products}
                                        onChange={val => updateItem(idx, 'product', val)}
                                        placeholder="Search product..."
                                    />
                                </div>
                                <div className="form-group" style={{ width: '100px', minWidth: '80px' }}>
                                    <label>Quantity</label>
                                    <input type="number" min="1" value={item.quantity || ''} onChange={e => updateItem(idx, 'quantity', parseInt(e.target.value) || 1)} onWheel={e => e.target.blur()} />
                                </div>
                                <div className="form-group" style={{ width: '120px', minWidth: '90px' }}>
                                    <label>Price/Unit <span style={{ fontSize: '10px', color: orderType === 'WHOLESALE' ? '#10b981' : '#4880FF', fontWeight: 600 }}>({orderType === 'WHOLESALE' ? 'W' : 'R'})</span></label>
                                    <input type="number" value={item.price || ''} readOnly disabled style={{ background: '#f5f5f5', cursor: 'not-allowed' }} />
                                </div>
                                <div className="form-group" style={{ width: '120px', minWidth: '90px' }}>
                                    <label>Discount/Unit <span style={{ fontSize: '10px', color: '#F59E0B', fontWeight: 600 }}>({symbol} off)</span></label>
                                    <input
                                        type="number" min="0"
                                        value={item.discount || ''}
                                        onChange={e => updateItem(idx, 'discount', parseFloat(e.target.value) || 0)}
                                        onWheel={e => e.target.blur()}
                                        placeholder="0"
                                        style={{ borderColor: item.discount > 0 ? '#F59E0B' : undefined }}
                                    />
                                </div>
                                <div className="form-group" style={{ width: '130px', minWidth: '90px' }}>
                                    <label>Line Total</label>
                                    <input type="text" value={formatCurrency((item.quantity || 0) * Math.max(0, (item.price || 0) - (item.discount || 0)))} readOnly disabled style={{ background: '#f5f5f5', cursor: 'not-allowed', color: item.discount > 0 ? '#10B981' : undefined }} />
                                </div>
                                <button type="button" onClick={() => removeItem(idx)} className="btn-icon delete" title="Remove item" style={{ marginBottom: '0.5rem' }}>
                                    <FiTrash2 />
                                </button>
                            </div>
                            {item.discount > 0 && (
                                <div style={{ fontSize: '11px', color: '#92400E', marginTop: '4px', paddingLeft: '2px' }}>
                                    Saving {formatCurrency(item.discount)} × {item.quantity} = {formatCurrency(calcItemDiscount(item))} on this item
                                </div>
                            )}
                        </div>
                    ))}

                    <button type="button" onClick={addItem} className="btn btn-secondary btn-sm mt-md">
                        <FiPlus /> Add Item
                    </button>

                    {/* Order summary */}
                    <div style={{ textAlign: 'right', marginTop: '1.5rem' }}>
                        <div style={{ fontSize: '0.95rem', color: '#64748B', marginBottom: '4px' }}>
                            Subtotal (before discounts): {formatCurrency(formData.items.reduce((acc, i) => acc + (i.quantity || 0) * (i.price || 0), 0))}
                        </div>
                        {calcTotalItemDiscounts() > 0 && (
                            <div style={{ fontSize: '0.95rem', color: '#F59E0B', marginBottom: '4px' }}>
                                Item Discounts: -{formatCurrency(calcTotalItemDiscounts())}
                            </div>
                        )}
                        {applyDiscount && discountAmount > 0 && (
                            <div style={{ fontSize: '0.95rem', color: '#F59E0B', marginBottom: '4px' }}>
                                Order Discount: -{formatCurrency(discountAmount)}
                            </div>
                        )}
                        {deliveryFee > 0 && (
                            <div style={{ fontSize: '0.95rem', color: '#64748B', marginBottom: '4px' }}>
                                Delivery Fee: +{formatCurrency(deliveryFee)}
                            </div>
                        )}
                        <div style={{ fontSize: '1.2rem', fontWeight: 'bold', color: '#10B981' }}>
                            Total: {formatCurrency(calcTotal())}
                        </div>
                    </div>
                </div>

                {/* Submit */}
                <div className="card mb-xl">
                    <div style={{ textAlign: 'right' }}>
                        <button type="button" className="btn btn-secondary" onClick={() => navigate(-1)} style={{ marginRight: '1rem' }}>
                            Cancel
                        </button>
                        <button type="submit" className="btn btn-primary" disabled={loading} style={{ padding: '0.75rem 2rem', fontSize: '1rem' }}>
                            {loading ? <Spinner size={20} color="#fff" /> : 'Create SOR Order'}
                        </button>
                    </div>
                </div>
            </form>
        </div>
    );
};

export default SOROrderCreate;
