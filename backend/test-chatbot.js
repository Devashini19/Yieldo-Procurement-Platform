async function testAdminChatbot() {
    console.log('--- TEST 1: Register test farmers for live verification ---');
    await fetch('http://localhost:4000/api/farmers/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            name: 'Ramesh Kumar',
            phone: '9840999888',
            crop: 'Paddy',
            quantityKg: 750,
            centreId: 'C01',
            slotDate: '2026-08-30',
            slotTime: '8:00 AM - 10:00 AM'
        })
    });

    await fetch('http://localhost:4000/api/farmers/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            name: 'Selvam Murugan',
            phone: '9840777666',
            crop: 'Groundnut',
            quantityKg: 400,
            centreId: 'C08',
            slotDate: '2026-08-30',
            slotTime: '10:00 AM - 12:00 PM'
        })
    });

    console.log('\n--- TEST 2: Ask about specific centre queue (English) ---');
    const q1Res = await fetch('http://localhost:4000/api/admin/chatbot/message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            message: 'How many farmers are currently in queue at Thanjavur Main centre?',
            language: 'en'
        })
    });
    const q1Data = await q1Res.json();
    console.log('Query 1 Response:\n', q1Data.reply);

    console.log('\n--- TEST 3: Ask about highest crowd centre ---');
    const q2Res = await fetch('http://localhost:4000/api/admin/chatbot/message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            message: 'Which centre has the highest crowd right now?',
            language: 'en'
        })
    });
    const q2Data = await q2Res.json();
    console.log('Query 2 Response:\n', q2Data.reply);

    console.log('\n--- TEST 4: Ask about support tickets summary ---');
    const q3Res = await fetch('http://localhost:4000/api/admin/chatbot/message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            message: 'Show me the support tickets and grievance breakdown',
            language: 'en'
        })
    });
    const q3Data = await q3Res.json();
    console.log('Query 3 Response:\n', q3Data.reply);

    console.log('\n--- TEST 5: Ask in Tamil ---');
    const q4Res = await fetch('http://localhost:4000/api/admin/chatbot/message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            message: 'தஞ்சாவூர் மையத்தில் எத்தனை விவசாயிகள் வரிசையில் உள்ளனர்?',
            language: 'ta'
        })
    });
    const q4Data = await q4Res.json();
    console.log('Query 4 Response (Tamil):\n', q4Data.reply);
}

testAdminChatbot().catch(console.error);