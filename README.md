# แคลอรีของฉัน — Google Apps Script Web App

เว็บแอปบันทึกอาหารภาษาไทยสำหรับ Google Sheet โดยมี dashboard, CRUD, การคำนวณแคลอรี/โปรตีนอัตโนมัติ และการเติม TDEE ล่าสุดให้ฟอร์มรายการถัดไป

## โครงสร้างข้อมูล

แอปจะสร้างแท็บชื่อ `sheet_1` และใช้หัวคอลัมน์ตามนี้:

```text
id	title	total_calorie	unit	calorie_per_unit	remark	total_protein	protein_per_unit	tdee	created_at	updated_at
```

ความหมายของค่าที่คำนวณ:

- `unit` คือปริมาณ/จำนวนหน่วยที่ใช้ทั้งคำนวณแคลอรีและโปรตีน
- `total_calorie = unit × calorie_per_unit`
- `total_protein = unit × protein_per_unit`
- `created_at` คือวันและเวลาที่รับประทาน/สร้างรายการจาก date-time picker
- `updated_at` คือวันและเวลาที่สร้างหรือแก้ไขรายการล่าสุด โดยระบบบันทึกให้อัตโนมัติ
- TDEE ของรายการแรกต้องกรอกเอง รายการต่อไปจะเติมค่าที่มี `updated_at` ล่าสุดให้โดยอัตโนมัติ

## ติดตั้ง

1. สร้าง Google Sheet เปล่า 1 ไฟล์
2. เปิด `Extensions > Apps Script`
3. สร้าง/วางไฟล์ `Code.gs`, `Index.html` และ `appsscript.json` จากโฟลเดอร์นี้
4. ใน Apps Script ให้เปิด `Project Settings` แล้วเปิดการแสดงไฟล์ manifest หากยังไม่เห็น `appsscript.json`
5. บันทึกโปรเจกต์ แล้วเรียกฟังก์ชัน `setupSheet` จากตัวแก้ไข Apps Script หนึ่งครั้งเพื่ออนุญาตสิทธิ์และสร้างแท็บ `sheet_1`
6. เลือก `Deploy > New deployment > Web app`
7. ตั้งค่า `Execute as: Me` และ `Who has access: Only myself`
8. เปิด URL ของ Web App ที่ได้

แนะนำให้ตั้ง timezone ของ Google Sheet เป็น `Asia/Bangkok` ด้วย เพื่อให้วันที่ในตารางตรงกับการสรุปบน dashboard

## ฟังก์ชันหลัก

- สรุปแคลอรี โปรตีน TDEE รายการคงเหลือ และ progress ของวันที่เลือก
- กราฟแนวโน้มย้อนหลัง 7, 30 หรือ 90 วัน
- เพิ่ม แก้ไข ลบ และค้นหารายการอาหาร
- เมื่อเลือก/กรอกชื่ออาหารที่เคยบันทึก ระบบเติมแคลอรีและโปรตีนต่อหน่วยจากรายการที่แก้ไขล่าสุดให้โดยอัตโนมัติ และยังแก้ไขค่าได้
- ฟอร์มรายการใหม่เติมปริมาณเริ่มต้นเป็น 1 หน่วย ส่วนการแก้ไขจะคงปริมาณเดิมไว้
- รองรับการเลือกวันที่ย้อนหลังจาก date picker
- ออกแบบ responsive สำหรับมือถือและหน้าจอขนาดใหญ่
