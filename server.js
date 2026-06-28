const express = require('express');
const multer = require('multer');
const { createClient } = require('@supabase/supabase-js');

const app = express();
app.use(express.json());
app.use(express.static(__dirname)); 

const SUPABASE_URL = 'https://yrybblnvdlcnesvpmbfu.supabase.co';
const SUPABASE_KEY = 'sb_publishable_oJbcEOb7zt_msZB3crnw9g_82P_Wy2Y';
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

// ดึงสินค้าทั้งหมด
app.get('/api/products', async (req, res) => {
    const { data, error } = await supabase.from('products').select('*').order('id', { ascending: false });
    if (error) return res.status(500).json({ error: error.message });
    res.json(data || []);
});

// เพิ่มสินค้าใหม่ (เพิ่มช่อง variant ย่อย และราคาสินค้า)
app.post('/api/add-product', upload.single('image'), async (req, res) => {
    try {
        const { sku, name, variant, category, price, qty } = req.body;
        let imageUrl = "https://img.icons8.com/pastel-glyph/64/4a90e2/image--v1.png";

        if (req.file) {
            const fileName = `${Date.now()}-${req.file.originalname}`;
            const { data: uploadData, error: uploadError } = await supabase.storage
                .from('products').upload(fileName, req.file.buffer, { contentType: req.file.mimetype, upsert: true });
            if (!uploadError) {
                imageUrl = supabase.storage.from('products').getPublicUrl(fileName).data.publicUrl;
            }
        }

        const { error: dbError } = await supabase.from('products').insert([
            { 
                sku: sku.trim(), 
                name: name.trim(), 
                variant: variant ? variant.trim() : null,
                category: category ? category.trim() : 'ทั่วไป', 
                price: parseFloat(price) || 0,
                total_stock: parseInt(qty) || 0,
                image_url: imageUrl
            }
        ]);

        if (dbError) throw dbError;
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// ✏️ API แก้ไขข้อมูลสินค้าเดิม
app.post('/api/edit-product', upload.single('image'), async (req, res) => {
    try {
        const { id, sku, name, variant, category, price, qty } = req.body;
        let updateData = {
            sku: sku.trim(),
            name: name.trim(),
            variant: variant ? variant.trim() : null,
            category: category ? category.trim() : 'ทั่วไป',
            price: parseFloat(price) || 0,
            total_stock: parseInt(qty) || 0
        };

        if (req.file) {
            const fileName = `${Date.now()}-${req.file.originalname}`;
            const { data: uploadData, error: uploadError } = await supabase.storage
                .from('products').upload(fileName, req.file.buffer, { contentType: req.file.mimetype, upsert: true });
            if (!uploadError) {
                updateData.image_url = supabase.storage.from('products').getPublicUrl(fileName).data.publicUrl;
            }
        }

        const { error } = await supabase.from('products').update(updateData).eq('id', id);
        if (error) throw error;
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// จัดการสต๊อก ดึงข้อมูลด้วย ID
app.post('/api/stock-action', async (req, res) => {
    const { id, action, quantity } = req.body;
    const { data: product } = await supabase.from('products').select('*').eq('id', id).single();
    if (!product) return res.status(404).json({ success: false, message: "ไม่พบสินค้า" });

    let updateData = {};
    if (action === 'in') {
        updateData.total_stock = product.total_stock + quantity;
    } else if (action === 'out') {
        if (product.total_stock < quantity) return res.status(400).json({ success: false, message: "สต๊อกสินค้าไม่พอขาย" });
        updateData.total_stock = product.total_stock - quantity;
    }

    await supabase.from('products').update(updateData).eq('id', id);
    res.json({ success: true });
});

app.listen(3000, () => console.log('🚀 Server is running!'));
