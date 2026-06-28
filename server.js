const express = require('express');
const multer = require('multer');
const { createClient } = require('@supabase/supabase-js');

const app = express();
app.use(express.json());
app.use(express.static(__dirname)); 

// 🔑 เชื่อมต่อ Supabase
const SUPABASE_URL = 'https://yrybblnvdlcnesvpmbfu.supabase.co';
const SUPABASE_KEY = 'sb_publishable_oJbcEOb7zt_msZB3crnw9g_82P_Wy2Y';
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

// [API] ส่งข้อมูลสินค้าทั้งหมด
app.get('/api/products', async (req, res) => {
    const { data, error } = await supabase.from('products').select('*').order('id', { ascending: false });
    if (error) return res.status(500).json({ error: error.message });
    res.json(data || []);
});

// [API] ดึงรายการหมวดหมู่ที่ไม่ซ้ำ
app.get('/api/categories', async (req, res) => {
    const { data, error } = await supabase.from('products').select('category');
    if (error) return res.status(500).json({ error: error.message });
    const categories = [...new Set(data.map(item => item.category).filter(Boolean))];
    res.json(categories);
});

// [API] เพิ่มสินค้าใหม่ (ตัด location ออก)
app.post('/api/add-product', upload.single('image'), async (req, res) => {
    try {
        const { sku, name, category, qty } = req.body;
        let imageUrl = "https://img.icons8.com/pastel-glyph/64/4a90e2/image--v1.png";

        const { data: existing } = await supabase.from('products').select('sku').eq('sku', sku.trim()).maybeSingle();
        if (existing) {
            return res.status(400).json({ success: false, message: "รหัส SKU นี้มีอยู่ในระบบคลังแล้ว ห้ามใส่ซ้ำ!" });
        }

        if (req.file) {
            const fileName = `${Date.now()}-${req.file.originalname}`;
            const { data: uploadData, error: uploadError } = await supabase.storage
                .from('products')
                .upload(fileName, req.file.buffer, {
                    contentType: req.file.mimetype,
                    upsert: true
                });

            if (uploadError) throw uploadError;

            const { data: urlData } = supabase.storage.from('products').getPublicUrl(fileName);
            imageUrl = urlData.publicUrl;
        }

        const { error: dbError } = await supabase.from('products').insert([
            { 
                sku: sku.trim(), 
                name: name.trim(), 
                category: category ? category.trim() : 'ทั่วไป', 
                total_stock: parseInt(qty) || 0,
                image_url: imageUrl
            }
        ]);

        if (dbError) throw dbError;
        res.json({ success: true });
    } catch (err) {
        console.error("❌ เกิดข้อผิดพลาด:", err.message);
        res.status(500).json({ success: false, message: err.message });
    }
});

// [API] จัดการสต๊อก
app.post('/api/stock-action', async (req, res) => {
    const { sku, action, quantity } = req.body;
    const { data: product } = await supabase.from('products').select('*').eq('sku', sku).single();
    if (!product) return res.status(404).json({ success: false, message: "ไม่พบสินค้า" });

    let updateData = {};
    if (action === 'in') {
        updateData.total_stock = product.total_stock + quantity;
    } else if (action === 'reserve') {
        if((product.total_stock - product.reserved_stock) < quantity) return res.status(400).json({ success: false, message: "สต๊อกพร้อมขายไม่พอ" });
        updateData.reserved_stock = product.reserved_stock + quantity;
    } else if (action === 'out') {
        if (product.total_stock < quantity) return res.status(400).json({ success: false, message: "สินค้าไม่พอขาย" });
        updateData.total_stock = product.total_stock - quantity;
        if(product.reserved_stock >= quantity) updateData.reserved_stock = product.reserved_stock - quantity;
    }

    await supabase.from('products').update(updateData).eq('sku', sku);
    res.json({ success: true });
});

// [API] ลบสินค้า
app.post('/api/delete-product', async (req, res) => {
    const { sku } = req.body;
    await supabase.from('products').delete().eq('sku', sku);
    res.json({ success: true });
});

app.listen(3000, () => console.log('🚀 Uni Stock Server Running at http://localhost:3000'));