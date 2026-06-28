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

app.get('/api/products', async (req, res) => {
    const { data, error } = await supabase.from('products').select('*').order('id', { ascending: false });
    if (error) return res.status(500).json({ error: error.message });
    res.json(data || []);
});

// บันทึกสินค้าหลัก + สีย่อยเป็นกลุ่ม
app.post('/api/add-product-bundle', upload.single('image'), async (req, res) => {
    try {
        const { name, category, variants } = req.body;
        const variantsList = JSON.parse(variants);
        
        let imageUrl = "https://img.icons8.com/pastel-glyph/64/4a90e2/image--v1.png";

        if (req.file) {
            const fileName = `${Date.now()}-${req.file.originalname}`;
            const { data: uploadData, error: uploadError } = await supabase.storage
                .from('products').upload(fileName, req.file.buffer, { contentType: req.file.mimetype, upsert: true });
            if (!uploadError) {
                imageUrl = supabase.storage.from('products').getPublicUrl(fileName).data.publicUrl;
            }
        }

        const insertRows = variantsList.map(v => ({
            sku: v.sku.trim(),
            name: name.trim(),
            variant: v.variant.trim(),
            category: category.trim(),
            price: parseFloat(v.price) || 0,
            total_stock: parseInt(v.qty) || 0,
            image_url: imageUrl
        }));

        const { error: dbError } = await supabase.from('products').insert(insertRows);
        if (dbError) throw dbError;

        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// 🔥 API ลบสินค้าเดี่ยว ๆ ออกจากระบบ
app.delete('/api/delete-product/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { error } = await supabase.from('products').delete().eq('id', id);
        if (error) throw error;
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

app.post('/api/stock-action', async (req, res) => {
    const { id, action, quantity } = req.body;
    const { data: product } = await supabase.from('products').select('*').eq('id', id).single();
    if (!product) return res.status(404).json({ success: false, message: "ไม่พบสินค้า" });

    let updateData = {};
    if (action === 'in') {
        updateData.total_stock = product.total_stock + quantity;
    } else if (action === 'out') {
        if (product.total_stock < quantity) return res.status(400).json({ success: false, message: "สต๊อกไม่พอดัดขาย" });
        updateData.total_stock = product.total_stock - quantity;
    }

    await supabase.from('products').update(updateData).eq('id', id);
    res.json({ success: true });
});

app.listen(3000, () => console.log('🚀 Server is running!'));
