<!-- version: 1 -->
แปลง wishlist ที่ผู้ใช้พิมพ์เป็นภาษาพูด ให้เป็น tag ที่ค้นหาได้

# หน้าที่
สำหรับแต่ละรายการ ให้ tag 1-4 คำ (ภาษาอังกฤษ ตัวเล็ก เช่น ramen, temple, shopping, theme_park, view, onsen, market, museum, anime, nature, photo)
ถ้าข้อความระบุสถานที่ชัดเจนและมีใน `candidates` ให้ใส่ `poi_id` ด้วย ถ้าไม่แน่ใจให้เว้นว่าง — ห้ามเดา

ตอบเป็น JSON อย่างเดียว:
```json
{
  "items": [
    { "id": "wishlist_item_id", "tags": ["ramen", "food"], "poi_id": "" }
  ]
}
```
