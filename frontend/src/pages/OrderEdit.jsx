import { useState, useEffect, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { toast } from 'react-toastify';
import { FiPlus, FiTrash2, FiPackage, FiBox } from 'react-icons/fi';
import api from '../utils/api';
import Spinner from '../components/Spinner';
import { useCountry } from '../context/CountryContext';
import useCurrency from '../hooks/useCurrency';

// ---------------------------------------------------------------------------
// ProductSearchSelect — identical to OrderCreate
// ---------------------------------------------------------------------------
const ProductSearchSelect = ({ value, options, onChange, placeholder }) => {
    const [isOpen, setIsOpen] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedProduct, setSelectedProduct] = useState(null);
    const containerRef = useRef(null);

    useEffect(() => {
        if (value) {
            const prod = options.find(p => p._id === value);
            setSelectedProduct(prod || null);
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
                onChange={e => { if (!selectedProduct) { setSearchTerm(e.target.value); if (!isOpen) setIsOpen(true); } }}
                onFocus={() => { if (!selectedProduct) setIsOpen(true); }}
                readOnly={!!selectedProduct}
                style={{ paddingRight: selectedProduct ? '35px' : '10px' }}
            />
            {selectedProduct && (
                <button type="button" onClick={() => { onChange(''); setSelectedProduct(null); setSearchTerm(''); setIsOpen(true); }}
                    style={{ position: 'absolute', right: '8px', top: '50%', transform: 'translateY(-50%)', background: 'transparent', border: 'none', cursor: 'pointer', color: '#666', fontSize: '18px', padding: '0 5px' }}
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

// ---------------------------------------------------------------------------
// BundleSearchSelect — identical to OrderCreate
// ---------------------------------------------------------------------------
const BundleSearchSelect = ({ value, options, onChange, placeholder }) => {
    const [isOpen, setIsOpen] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedBundle, setSelectedBundle] = useState(null);
    const containerRef = useRef(null);

    useEffect(() => {
        if (value) {
            const b = options.find(b => b._id === value);
            setSelectedBundle(b || null);
            setSearchTerm(b ? b.name : '');
        } else { setSelectedBundle(null); setSearchTerm(''); }
    }, [value, options]);

    useEffect(() => {
        const handleClickOutside = (e) => {
            if (containerRef.current && !containerRef.current.contains(e.target)) {
                setIsOpen(false);
                if (selectedBundle) setSearchTerm(selectedBundle.name); else setSearchTerm('');
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [selectedBundle]);

    const filtered = options.filter(b => b.name.toLowerCase().includes(searchTerm.toLowerCase()));

    return (
        <div className="search-select-container" ref={containerRef} style={{ position: 'relative' }}>
            <input type="text" className="search-select-input" placeholder={placeholder} value={searchTerm}
                onChange={e => { if (!selectedBundle) { setSearchTerm(e.target.value); if (!isOpen) setIsOpen(true); } }}
                onFocus={() => { if (!selectedBundle) setIsOpen(true); }}
                readOnly={!!selectedBundle} style={{ paddingRight: selectedBundle ? '35px' : '10px' }} />
            {selectedBundle && (
                <button type="button" onClick={() => { onChange(''); setSelectedBundle(null); setSearchTerm(''); setIsOpen(true); }}
                    style={{ position: 'absolute', right: '8px', top: '50%', transform: 'translateY(-50%)', background: 'transparent', border: 'none', cursor: 'pointer', color: '#666', fontSize: '18px', padding: '0 5px' }}
                    title="Change bundle">×</button>
            )}
            {isOpen && !selectedBundle && (
                <div className="search-select-dropdown">
                    {filtered.length > 0 ? filtered.map(b => (
                        <div key={b._id} className={`search-select-option ${b._id === value ? 'active' : ''}`}
                            onClick={e => { e.stopPropagation(); onChange(b._id); setIsOpen(false); }}>
                            <span className="p-name">{b.name}</span>
                            <span className="p-sku" style={{ fontSize: '11px', color: '#94a3b8' }}>{b.products.length} product{b.products.length !== 1 ? 's' : ''}</span>
                        </div>
                    )) : <div className="search-select-no-results">No bundles found</div>}
                </div>
            )}
        </div>
    );
};

// ---------------------------------------------------------------------------
// OrderEdit page
// ---------------------------------------------------------------------------
const OrderEdit = () => {
    const { id } = useParams();
    const navigate = useNavigate();
    const { activeCountry } = useCountry();
    const { formatShort, symbol } = useCurrency();

    const [pageLoading, setPageLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);
    const [order, setOrder] = useState(null);

    // Reference data
    const [regions, setRegions] = useState([]);
    const [warehouses, setWarehouses] = useState([]);
    const [products, setProducts] = useState([]);
    const [bundles, setBundles] = useState([]);
    const [inventory, setInventory] = useState({});

    // Form state
    const [orderType, setOrderType] = useState('RETAIL');
    const [applyDiscount, setApplyDiscount] = useState(false);
    const [discountType, setDiscountType] = useState('none');
    const [globalDiscount, setGlobalDiscount] = useState(0);
    const [deliveryFee, setDeliveryFee] = useState(0);
    const [formData, setFormData] = useState({
        customer: { name: '', street: '', city: '', state: '', zip: '', country: 'Nigeria', phone: '', email: '' },
        region: '',
        warehouse: '',
        items: [],
        channel: 'Other',
    });

    // Load regions on mount
    useEffect(() => {
        if (!activeCountry?._id) return;
        api.get(`/regions?countryId=${activeCountry._id}`).then(res => setRegions(res.data.data)).catch(console.error);
    }, [activeCountry?._id]);

    // Load warehouses when region changes
    useEffect(() => {
        if (formData.region) {
            const region = regions.find(r => r._id === formData.region);
            setWarehouses(region ? region.warehouses : []);
        }
    }, [formData.region, regions]);

    // Load products/inventory when warehouse changes
    useEffect(() => {
        if (formData.warehouse) {
            loadWarehouseData(formData.warehouse);
        }
    }, [formData.warehouse]);

    const loadWarehouseData = async (warehouseId) => {
        try {
            const countryParam = activeCountry?._id ? `&countryId=${activeCountry._id}` : '';
            const [prodRes, invRes, bundleRes] = await Promise.all([
                api.get(`/products?limit=1000&countryId=${activeCountry._id}`),
                api.get(`/inventory/balance?warehouseId=${warehouseId}${countryParam}`),
                api.get(`/bundles?status=ACTIVE&countryId=${activeCountry._id}`),
            ]);
            setProducts(prodRes.data.data.filter(p => p.status === 'ACTIVE'));
            setBundles(bundleRes.data.data);
            const invMap = {};
            invRes.data.data.forEach(item => {
                if (item.product?._id) invMap[item.product._id] = item.available;
            });
            setInventory(invMap);
        } catch (err) {
            console.error('Failed to load warehouse data', err);
        }
    };

    // Fetch existing order and pre-populate form
    useEffect(() => {
        const fetchOrder = async () => {
            try {
                const res = await api.get(`/orders/${id}`);
                const o = res.data.data;
                setOrder(o);

                if (o.status === 'CANCELLED') {
                    setPageLoading(false);
                    return;
                }

                setOrderType(o.orderType || 'RETAIL');
                setDeliveryFee(o.deliveryFee || 0);

                // Restore discount state
                if (o.discountType && o.discountType !== 'none') {
                    setApplyDiscount(true);
                    setDiscountType(o.discountType);
                    if (o.discountType === 'global') setGlobalDiscount(o.discountAmount || 0);
                }

                // Parse address back into fields
                let street = o.customer?.address || '';
                let city = '', state = '', zip = '';
                const parts = (o.customer?.address || '').split(', ');
                if (parts.length >= 3) {
                    street = parts[0];
                    city = parts[1];
                    const stateZip = parts[2].split(' ');
                    state = stateZip[0] || '';
                    zip = stateZip[1] || '';
                }

                // Map stored items (flat product items) back to form rows
                const formItems = (o.items || []).map(item => ({
                    type: 'PRODUCT',
                    product: item.product?._id || item.product,
                    bundle: '',
                    cartonQty: 0,
                    pieceQty: item.quantity || 0,
                    bundleQty: 0,
                    price: item.price || 0,
                    discount: o.discountType === 'individual' ? 0 : 0,
                }));

                setFormData({
                    customer: {
                        name: o.customer?.name || '',
                        street,
                        city,
                        state,
                        zip,
                        country: o.customer?.country || 'Nigeria',
                        phone: o.customer?.phone || '',
                        email: o.customer?.email || '',
                    },
                    region: o.region?._id || o.region || '',
                    warehouse: o.warehouse?._id || o.warehouse || '',
                    items: formItems,
                    channel: o.channel || 'Other',
                });
            } catch (err) {
                toast.error('Failed to load order');
                navigate('/orders');
            } finally {
                setPageLoading(false);
            }
        };
        fetchOrder();
    }, [id]);

    const addItem = () => {
        setFormData(prev => ({
            ...prev,
            items: [...prev.items, { type: 'PRODUCT', product: '', bundle: '', cartonQty: 0, pieceQty: 0, bundleQty: 0, price: 0, discount: 0 }],
        }));
    };

    const removeItem = (index) => {
        setFormData(prev => ({ ...prev, items: prev.items.filter((_, i) => i !== index) }));
    };

    const updateItem = (index, field, value) => {
        setFormData(prev => {
            const items = [...prev.items];
            items[index] = { ...items[index], [field]: value };

            if (field === 'type') {
                if (value === 'PRODUCT') { items[index].bundle = ''; items[index].bundleQty = 0; }
                else { items[index].product = ''; items[index].cartonQty = 0; items[index].pieceQty = 0; }
                items[index].discount = 0;
            }
            if (field === 'product') {
                const product = products.find(p => p._id === value);
                if (product) items[index].price = orderType === 'WHOLESALE' ? (product.wholesaleCost || 0) : (product.price || 0);
                items[index].discount = 0;
            }
            if (field === 'bundle') {
                const bundle = bundles.find(b => b._id === value);
                if (bundle) {
                    items[index].price = bundle.retailPrice != null ? bundle.retailPrice :
                        bundle.products.reduce((s, bp) => s + bp.quantity * (bp.product?.price || 0), 0);
                }
            }
            return { ...prev, items };
        });
    };

    const handleOrderTypeChange = (newType) => {
        setOrderType(newType);
        setFormData(prev => ({
            ...prev,
            items: prev.items.map(item => {
                if (item.type === 'PRODUCT') {
                    const product = products.find(p => p._id === item.product);
                    if (product) return { ...item, price: newType === 'WHOLESALE' ? (product.wholesaleCost || 0) : (product.price || 0) };
                }
                return item;
            }),
        }));
    };

    const calculateTotal = () => {
        const subtotal = formData.items.reduce((acc, item) => {
            if (item.type === 'BUNDLE') {
                const bundle = bundles.find(b => b._id === item.bundle);
                if (!bundle) return acc;
                const unitPrice = bundle.retailPrice != null ? bundle.retailPrice :
                    bundle.products.reduce((s, bp) => s + bp.quantity * (bp.product?.price || 0), 0);
                return acc + item.bundleQty * unitPrice;
            }
            const product = products.find(p => p._id === item.product);
            const cartonSize = product?.cartonSize || 1;
            const pieces = (item.cartonQty * cartonSize) + item.pieceQty;
            const discount = (applyDiscount && discountType === 'individual') ? (item.discount || 0) : 0;
            return acc + pieces * Math.max(0, item.price - discount);
        }, 0);

        let total = subtotal;
        if (applyDiscount && discountType === 'global') total = Math.max(0, subtotal - globalDiscount);
        return total + (deliveryFee || 0);
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (formData.items.length === 0) return toast.error('Add at least one item');
        setSubmitting(true);
        try {
            const addressParts = [
                formData.customer.street,
                formData.customer.city,
                [formData.customer.state, formData.customer.zip].filter(Boolean).join(' '),
            ].map((part) => (part || '').trim()).filter(Boolean);
            const combinedAddress = addressParts.join(', ');
            const customerData = {
                ...formData.customer,
                address: combinedAddress,
                // Always the country the app is operating in
                country: activeCountry?.name || formData.customer.country,
            };

            const expandedItems = [];
            let itemsSubtotal = 0;
            let orderSubtotal = 0;

            for (const item of formData.items) {
                if (item.type === 'BUNDLE') {
                    const bundle = bundles.find(b => b._id === item.bundle);
                    if (!bundle) throw new Error('Please select a bundle for each bundle item');
                    if (!item.bundleQty || item.bundleQty < 1) throw new Error('Each bundle item must have at least 1 unit');
                    const bundleUnitPrice = bundle.retailPrice != null ? bundle.retailPrice :
                        bundle.products.reduce((s, bp) => s + bp.quantity * (bp.product?.price || 0), 0);
                    const totalCalc = bundle.products.reduce((s, bp) => s + bp.quantity * (bp.product?.price || 0), 0);
                    for (const bp of bundle.products) {
                        const ratio = totalCalc > 0 ? (bp.quantity * (bp.product?.price || 0)) / totalCalc : 0;
                        const productPrice = bundleUnitPrice * ratio / bp.quantity;
                        const lineTotal = item.bundleQty * bp.quantity * productPrice;
                        itemsSubtotal += lineTotal;
                        orderSubtotal += lineTotal;
                        expandedItems.push({ product: bp.product._id, quantity: item.bundleQty * bp.quantity, price: productPrice, originalPrice: productPrice, discount: 0 });
                    }
                } else {
                    if (item.cartonQty === 0 && item.pieceQty === 0) throw new Error('Each product item must have a Carton or Piece quantity');
                    const product = products.find(p => p._id === item.product);
                    const cartonSize = product?.cartonSize || 1;
                    const quantity = (item.cartonQty * cartonSize) + item.pieceQty;
                    let pricePerPiece = item.price;
                    let discountPerPiece = 0;
                    if (applyDiscount && discountType === 'individual') {
                        discountPerPiece = Math.min(item.price, item.discount || 0);
                        pricePerPiece = Math.max(0, item.price - discountPerPiece);
                    }
                    itemsSubtotal += quantity * pricePerPiece;
                    orderSubtotal += quantity * item.price;
                    // Keep the actual price so documents can show the discount
                    expandedItems.push({ product: item.product, quantity, price: pricePerPiece, originalPrice: item.price, discount: discountPerPiece });
                }
            }

            if (applyDiscount && discountType === 'global' && globalDiscount > 0) {
                const ratio = Math.max(0, (itemsSubtotal - globalDiscount)) / itemsSubtotal;
                expandedItems.forEach(item => { item.price = item.price * ratio; });
            }

            let finalDiscountAmount = 0;
            let finalDiscountType = 'none';
            if (applyDiscount) {
                if (discountType === 'global' && globalDiscount > 0) { finalDiscountAmount = globalDiscount; finalDiscountType = 'global'; }
                else if (discountType === 'individual') {
                    finalDiscountAmount = orderSubtotal - itemsSubtotal;
                    if (finalDiscountAmount > 0) finalDiscountType = 'individual';
                }
            }

            const payload = {
                customer: customerData,
                region: formData.region,
                warehouse: formData.warehouse,
                items: expandedItems,
                channel: formData.channel,
                orderType,
                discountAmount: finalDiscountAmount,
                discountType: finalDiscountType,
                deliveryFee: deliveryFee || 0,
                subtotal: orderSubtotal,
                ...(activeCountry?._id && { countryId: activeCountry._id }),
            };

            await api.put(`/orders/${id}`, payload);
            toast.success('Order updated successfully');
            navigate(`/orders/${id}`);
        } catch (err) {
            toast.error(err.response?.data?.message || err.message || 'Failed to update order');
        } finally {
            setSubmitting(false);
        }
    };

    if (pageLoading) return <Spinner fullPage />;

    // Cancelled order — read-only notice
    if (order?.status === 'CANCELLED') {
        return (
            <div className="page-container">
                <div className="page-header"><h1>Edit Order</h1></div>
                <div className="card" style={{ textAlign: 'center', padding: '2rem', color: '#718096' }}>
                    <p style={{ fontSize: '1.1rem', fontWeight: 600 }}>This order is cancelled and cannot be edited.</p>
                    <button className="btn btn-secondary" style={{ marginTop: '1rem' }} onClick={() => navigate(`/orders/${id}`)}>
                        Back to Order
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="page-container">
            <div className="page-header">
                <h1>Edit Order #{order?.orderNumber}</h1>
                <button type="button" className="btn btn-secondary" onClick={() => navigate(`/orders/${id}`)}>Cancel</button>
            </div>

            {/* Order Type Selector */}
            <div style={{ background: '#F7FAFC', padding: '16px 24px', borderRadius: '8px', marginBottom: '20px', border: '1px solid #E2E8F0', display: 'flex', flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: '16px', maxWidth: '1200px', margin: '0 auto 20px auto' }}>
                <span style={{ fontSize: '14px', fontWeight: 600, color: '#2D3748' }}>Order Type:</span>
                <div style={{ display: 'flex', gap: '8px' }}>
                    {['RETAIL', 'WHOLESALE'].map(t => (
                        <button key={t} type="button" onClick={() => handleOrderTypeChange(t)}
                            style={{ padding: '8px 20px', borderRadius: '6px', border: orderType === t ? '2px solid #4880FF' : '1px solid #CBD5E0', background: orderType === t ? '#4880FF' : 'white', color: orderType === t ? 'white' : '#4A5568', fontWeight: orderType === t ? 600 : 400, cursor: 'pointer', fontSize: '14px', minWidth: '140px' }}>
                            {t === 'RETAIL' ? 'Retail Price' : 'Wholesale Price'}
                        </button>
                    ))}
                </div>
            </div>

            <form onSubmit={handleSubmit} style={{ maxWidth: '1200px', margin: '0 auto' }}>
                {/* Customer Details */}
                <div className="card mb-xl" style={{ marginBottom: '1rem' }}>
                    <h3 className="mb-lg border-bottom pb-sm">Customer Details</h3>
                    <div className="form-group">
                        <label>Name</label>
                        <input value={formData.customer.name} onChange={e => setFormData(p => ({ ...p, customer: { ...p.customer, name: e.target.value } }))} required />
                    </div>
                    <div className="form-group">
                        <label>Street Address</label>
                        <input value={formData.customer.street} onChange={e => setFormData(p => ({ ...p, customer: { ...p.customer, street: e.target.value } }))} required />
                    </div>
                    <div className="form-row">
                        <div className="form-group">
                            <label>City (Optional)</label>
                            <input value={formData.customer.city} onChange={e => setFormData(p => ({ ...p, customer: { ...p.customer, city: e.target.value } }))} />
                        </div>
                        <div className="form-group">
                            <label>State/Province (Optional)</label>
                            <input value={formData.customer.state} onChange={e => setFormData(p => ({ ...p, customer: { ...p.customer, state: e.target.value } }))} />
                        </div>
                        <div className="form-group">
                            <label>Zip Code (Optional)</label>
                            <input value={formData.customer.zip} onChange={e => setFormData(p => ({ ...p, customer: { ...p.customer, zip: e.target.value } }))} />
                        </div>
                    </div>
                    <div className="form-row">
                        <div className="form-group">
                            <label>Country</label>
                            {/* Orders belong to the country the app is switched to — not a free choice */}
                            <input value={activeCountry?.name || ''} readOnly disabled style={{ background: '#F8FAFC', color: '#64748B' }} />
                        </div>
                    </div>
                    <div className="form-row">
                        <div className="form-group">
                            <label>Email</label>
                            <input type="email" value={formData.customer.email} onChange={e => setFormData(p => ({ ...p, customer: { ...p.customer, email: e.target.value } }))} />
                        </div>
                        <div className="form-group">
                            <label>Phone</label>
                            <input value={formData.customer.phone} onChange={e => setFormData(p => ({ ...p, customer: { ...p.customer, phone: e.target.value } }))} />
                        </div>
                    </div>
                </div>

                {/* Fulfillment Center */}
                <div className="card mb-xl" style={{ marginBottom: '1rem' }}>
                    <h3 className="mb-lg border-bottom pb-sm">Fulfillment Center</h3>
                    <div className="form-row">
                        <div className="form-group">
                            <label>Region</label>
                            <select value={formData.region} onChange={e => setFormData(p => ({ ...p, region: e.target.value, warehouse: '' }))} required>
                                <option value="">Select Region...</option>
                                {regions.map(r => <option key={r._id} value={r._id}>{r.name}</option>)}
                            </select>
                        </div>
                        <div className="form-group">
                            <label>Warehouse</label>
                            <select value={formData.warehouse} onChange={e => setFormData(p => ({ ...p, warehouse: e.target.value }))} required disabled={!formData.region}>
                                <option value="">Select Warehouse...</option>
                                {warehouses.map(w => <option key={w._id} value={w._id}>{w.name}</option>)}
                            </select>
                        </div>
                    </div>
                    <div className="form-group">
                        <label>How did the customer find us?</label>
                        <select value={formData.channel} onChange={e => setFormData(p => ({ ...p, channel: e.target.value }))} required>
                            {['Instagram','Google','Facebook','Referral','Walk-in','Other'].map(c => <option key={c} value={c}>{c}</option>)}
                        </select>
                    </div>
                </div>

                {/* Order Items */}
                <div className="card mb-xl" style={{ marginBottom: '1rem' }}>
                    <h3>Order Items</h3>
                    {formData.warehouse ? (
                        <div className="items-context">
                            {/* Discount Controls */}
                            <div style={{ background: '#FFFBEB', padding: '12px 16px', borderRadius: '6px', marginBottom: '16px', border: '1px solid #FDE68A' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                                    <button type="button" onClick={() => setApplyDiscount(v => !v)}
                                        style={{ padding: '6px 16px', borderRadius: '6px', border: applyDiscount ? '2px solid #F59E0B' : '1px solid #FCD34D', background: applyDiscount ? '#F59E0B' : 'white', color: applyDiscount ? 'white' : '#92400E', fontWeight: 600, cursor: 'pointer', fontSize: '13px' }}>
                                        {applyDiscount ? '✓ Discount Applied' : '+ Apply Discount'}
                                    </button>
                                    {applyDiscount && (
                                        <>
                                            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                                                <span style={{ fontSize: '13px', color: '#92400E', fontWeight: 500 }}>Type:</span>
                                                {['individual', 'global'].map(t => (
                                                    <button key={t} type="button" onClick={() => setDiscountType(t)}
                                                        style={{ padding: '4px 12px', borderRadius: '5px', border: discountType === t ? '2px solid #F59E0B' : '1px solid #FCD34D', background: discountType === t ? '#FEF3C7' : 'white', color: '#92400E', fontWeight: discountType === t ? 600 : 400, cursor: 'pointer', fontSize: '12px' }}>
                                                        {t.charAt(0).toUpperCase() + t.slice(1)}
                                                    </button>
                                                ))}
                                            </div>
                                            {discountType === 'global' && (
                                                <>
                                                    <label style={{ fontSize: '12px', color: '#92400E', fontWeight: 500 }}>Total Discount:</label>
                                                    <input type="number" min="0" value={globalDiscount || ''} onChange={e => setGlobalDiscount(parseFloat(e.target.value) || 0)}
                                                        placeholder="0" style={{ width: '120px', padding: '4px 8px', borderRadius: '5px', border: '1px solid #FCD34D', fontSize: '13px' }} />
                                                    <span style={{ fontSize: '11px', color: '#78350F' }}>{symbol} off total order</span>
                                                </>
                                            )}
                                        </>
                                    )}
                                </div>
                            </div>

                            {/* Delivery Fee */}
                            <div style={{ background: '#F0F9FF', padding: '12px 16px', borderRadius: '6px', marginBottom: '16px', border: '1px solid #BAE6FD', display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                                <label style={{ fontSize: '13px', color: '#0C4A6E', fontWeight: 600 }}>Delivery Fee:</label>
                                <input type="number" min="0" value={deliveryFee || ''} onChange={e => setDeliveryFee(parseFloat(e.target.value) || 0)}
                                    placeholder="0" style={{ width: '140px', padding: '6px 12px', borderRadius: '5px', border: '1px solid #BAE6FD', fontSize: '13px' }} />
                                <span style={{ fontSize: '12px', color: '#0369A1' }}>{symbol} (optional)</span>
                            </div>

                            {/* Item Rows */}
                            {formData.items.map((item, idx) => {
                                const available = inventory[item.product] || 0;
                                const selectedBundle = item.type === 'BUNDLE' ? bundles.find(b => b._id === item.bundle) : null;
                                const product = products.find(p => p._id === item.product);
                                const cartonSize = product?.cartonSize || 1;
                                const pieces = (item.cartonQty * cartonSize) + item.pieceQty;
                                const discount = (applyDiscount && discountType === 'individual') ? (item.discount || 0) : 0;
                                const lineTotal = item.type === 'BUNDLE'
                                    ? (item.bundleQty * (selectedBundle?.retailPrice ?? (selectedBundle?.products.reduce((s, bp) => s + bp.quantity * (bp.product?.price || 0), 0) ?? 0)))
                                    : pieces * Math.max(0, item.price - discount);

                                return (
                                    <div key={idx} className="item-row card-row" style={{ paddingBottom: '1rem', borderBottom: '1px solid #eee', marginBottom: '1rem' }}>
                                        <div style={{ display: 'flex', gap: '6px', marginBottom: '10px', alignItems: 'center' }}>
                                            <button type="button" onClick={() => updateItem(idx, 'type', 'PRODUCT')}
                                                style={{ padding: '4px 14px', borderRadius: '5px', fontSize: '12px', fontWeight: 600, border: item.type === 'PRODUCT' ? '2px solid #4880FF' : '1px solid #CBD5E0', background: item.type === 'PRODUCT' ? '#EBF2FF' : 'white', color: item.type === 'PRODUCT' ? '#4880FF' : '#718096', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                <FiBox size={12} /> Product
                                            </button>
                                            <button type="button" onClick={() => updateItem(idx, 'type', 'BUNDLE')}
                                                style={{ padding: '4px 14px', borderRadius: '5px', fontSize: '12px', fontWeight: 600, border: item.type === 'BUNDLE' ? '2px solid #8B5CF6' : '1px solid #CBD5E0', background: item.type === 'BUNDLE' ? '#F3EEFF' : 'white', color: item.type === 'BUNDLE' ? '#8B5CF6' : '#718096', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                <FiPackage size={12} /> Bundle
                                            </button>
                                            <button type="button" onClick={() => removeItem(idx)} style={{ marginLeft: 'auto', background: 'transparent', border: 'none', cursor: 'pointer', color: '#E53E3E' }} title="Remove item">
                                                <FiTrash2 size={16} />
                                            </button>
                                        </div>

                                        <div style={{ display: 'flex', gap: '1rem', alignItems: 'flex-start', flexWrap: 'wrap' }}>
                                            {item.type === 'BUNDLE' ? (
                                                <>
                                                    <div className="form-group flex-grow" style={{ flex: 2, minWidth: '250px' }}>
                                                        <label>Bundle</label>
                                                        <BundleSearchSelect value={item.bundle} options={bundles} onChange={val => updateItem(idx, 'bundle', val)} placeholder="Search Bundle..." />
                                                        {selectedBundle && (
                                                            <div style={{ marginTop: '4px', fontSize: '11px', color: '#64748B' }}>
                                                                {selectedBundle.products.map((bp, i) => <span key={i}>{bp.quantity}× {bp.product?.name}{i < selectedBundle.products.length - 1 ? ', ' : ''}</span>)}
                                                            </div>
                                                        )}
                                                    </div>
                                                    <div className="form-group" style={{ width: '100px' }}>
                                                        <label>Units</label>
                                                        <input type="number" min="1" value={item.bundleQty || ''} onChange={e => updateItem(idx, 'bundleQty', parseInt(e.target.value) || 0)} />
                                                    </div>
                                                    <div className="form-group" style={{ width: '120px' }}>
                                                        <label>Line Total</label>
                                                        <input type="text" value={formatShort(lineTotal)} readOnly disabled style={{ background: '#f5f5f5' }} />
                                                    </div>
                                                </>
                                            ) : (
                                                <>
                                                    <div className="form-group flex-grow" style={{ flex: 2, minWidth: '250px' }}>
                                                        <label>Product</label>
                                                        <ProductSearchSelect value={item.product} options={products} onChange={val => updateItem(idx, 'product', val)} placeholder="Search Product..." />
                                                        {item.product && <div style={{ fontSize: '11px', color: available > 0 ? '#38A169' : '#E53E3E', marginTop: '2px' }}>Available: {available} pcs</div>}
                                                    </div>
                                                    <div className="form-group" style={{ width: '90px' }}>
                                                        <label>Cartons</label>
                                                        <input type="number" min="0" value={item.cartonQty || ''} onChange={e => updateItem(idx, 'cartonQty', parseInt(e.target.value) || 0)} />
                                                        {product && <div style={{ fontSize: '10px', color: '#718096' }}>{cartonSize} pcs/ctn</div>}
                                                    </div>
                                                    <div className="form-group" style={{ width: '90px' }}>
                                                        <label>Pieces</label>
                                                        <input type="number" min="0" value={item.pieceQty || ''} onChange={e => updateItem(idx, 'pieceQty', parseInt(e.target.value) || 0)} />
                                                    </div>
                                                    <div className="form-group" style={{ width: '110px' }}>
                                                        <label>Price/pc ({symbol})</label>
                                                        <input type="number" min="0" step="0.01" value={item.price || ''} onChange={e => updateItem(idx, 'price', parseFloat(e.target.value) || 0)} />
                                                    </div>
                                                    {applyDiscount && discountType === 'individual' && (
                                                        <div className="form-group" style={{ width: '100px' }}>
                                                            <label>Discount/pc</label>
                                                            <input type="number" min="0" step="0.01" value={item.discount || ''} onChange={e => updateItem(idx, 'discount', parseFloat(e.target.value) || 0)} />
                                                        </div>
                                                    )}
                                                    <div className="form-group" style={{ width: '120px' }}>
                                                        <label>Line Total</label>
                                                        <input type="text" value={formatShort(lineTotal)} readOnly disabled style={{ background: '#f5f5f5' }} />
                                                    </div>
                                                </>
                                            )}
                                        </div>
                                    </div>
                                );
                            })}

                            <button type="button" className="btn btn-secondary" onClick={addItem} style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '0.5rem' }}>
                                <FiPlus size={14} /> Add Item
                            </button>
                        </div>
                    ) : (
                        <p style={{ color: '#718096', fontStyle: 'italic' }}>Select a warehouse to add items.</p>
                    )}
                </div>

                {/* Order Summary */}
                <div className="card mb-xl" style={{ marginBottom: '1rem' }}>
                    <h3 className="mb-lg border-bottom pb-sm">Order Summary</h3>
                    <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                        <div style={{ minWidth: '260px' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', fontSize: '14px', color: '#4A5568' }}>
                                <span>Estimated Total</span>
                                <span style={{ fontWeight: 700, fontSize: '16px', color: '#2D3748' }}>{formatShort(calculateTotal())}</span>
                            </div>
                        </div>
                    </div>
                </div>

                <div style={{ display: 'flex', gap: '1rem', justifyContent: 'flex-end', maxWidth: '1200px', margin: '0 auto' }}>
                    <button type="button" className="btn btn-secondary" onClick={() => navigate(`/orders/${id}`)} disabled={submitting}>Cancel</button>
                    <button type="submit" className="btn btn-primary" disabled={submitting || formData.items.length === 0}>
                        {submitting ? 'Saving...' : 'Save Changes'}
                    </button>
                </div>
            </form>
        </div>
    );
};

export default OrderEdit;
