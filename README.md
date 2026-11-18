# Konversa AI

Yon dashboard SaaS pou asistan komèsyal dijital ki vize ti biznis ann Ayiti.

## Vèsyon aktyèl
Sa a se **frontend preview v0.1.0**. Li gen navigasyon ant paj yo, layout responsive, ekran jesyon pwodwi demo, ak paj koneksyon chanèl.

### Paj ki enkli
- Apèsi jeneral
- Konvèsasyon
- Pwodwi & stock
- Kòmand
- Kliyan
- Asistan AI
- Chanèl koneksyon
- Analiz & rapò
- Paramèt

## Kouri lokalman
Louvri `index.html` nan navigatè a. Pa gen build step obligatwa.

## Pwochen faz teknik
1. Supabase Auth ak bazdone multi-tenant (separe done chak biznis).
2. Backend Node.js sou Render pou webhook ak pwosesis mesaj.
3. WhatsApp Cloud API ofisyèl Meta (sandbox an premye).
4. AI ki chèche pri/stock nan bazdone a epi ki pase bay yon moun lè li pa sèten.
5. Facebook Messenger apre tès WhatsApp yo.

## Sekirite ak limit
- Pa mete token Meta, kle AI, Supabase service-role key oswa lòt sekrè nan frontend.
- Pa janm mande modpas pèsonèl WhatsApp itilizatè a.
- Done nan tablo yo se demo; yo pa sove pèmanan nan vèsyon sa a.
- Pa fè AI envante pri, stock, rabè oswa konfimasyon peman.
