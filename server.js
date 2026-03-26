const express = require('express');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// In-memory stats
let campaigns = {};
let recentEvents = [];
const MAX_EVENTS = 50;

function initCampaign(id, name, location) {
    if (!campaigns[id]) {
        campaigns[id] = {
            id,
            name: name || `Campaign-${id}`, // Ensure name is set
            locationStats: {}, // Use dictionary for locations
            totalAudience: 0,
            totalAttentionSeconds: 0, // New field to store sum of attention times
            eventsCount: 0,
            audienceLog: [] // Store individual detection events
        };
    }
    if (location && typeof location === 'string') {
        if (!campaigns[id].locationStats[location]) {
            campaigns[id].locationStats[location] = {
                name: location,
                totalAudience: 0,
                totalAttentionSeconds: 0,
                eventsCount: 0
            };
        }
    }
}

app.post('/api/events', (req, res) => {
    const event = req.body;
    if (!event || !event.campaign_id) return res.status(400).json({error:'Invalid'});
    
    initCampaign(event.campaign_id, event.campaign_name, event.location);
    const c = campaigns[event.campaign_id];
    const a = event.audience;
    
    const count = a.total_count || 0;
    const newAtt = a.attention.average_attention_time_seconds || 0;

    c.totalAudience += count;
    c.eventsCount++;
    c.totalAttentionSeconds += newAtt;

    if (event.location && c.locationStats[event.location]) {
        const loc = c.locationStats[event.location];
        loc.totalAudience += count;
        loc.totalAttentionSeconds += newAtt;
        loc.eventsCount++;
    }

    c.audienceLog.unshift({
        timestamp: event.timestamp || Date.now(),
        location: event.location,
        audienceCount: count,
        attentionTime: newAtt
    });
    if (c.audienceLog.length > 50) c.audienceLog.pop(); // Keep top 50 recent audiences for this campaign
    
    recentEvents.unshift(event);
    if (recentEvents.length > MAX_EVENTS) recentEvents.pop();

    res.status(200).json({status: 'ok'});
});

// To simulate timescales, we'll generate some static history charts data on the fly based on the timescale
app.get('/api/stats', (req, res) => {
    const scale = req.query.timeScale || 'day'; // day, week, month
    let multiplier = scale === 'month' ? 30 : (scale === 'week' ? 7 : 1);
    
    // Create chart data: array of objects { label, value } for line chart
    const labels = scale === 'day' ? ['08:00', '12:00', '16:00', '20:00'] :
                   (scale === 'week' ? ['Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab', 'Min'] :
                   ['Mg 1', 'Mg 2', 'Mg 3', 'Mg 4']);
    
    const chartData = labels.map((l, idx) => ({
        label: l,
        // Make the line chart curve nicely
        value: Math.floor(Math.sin(idx) * 100 * multiplier + 300 * multiplier + Math.random() * 50 * multiplier)
    }));

    // Generate campaigns list
    const campaignsList = Object.values(campaigns).map(c => {
        const processedLocations = Object.values(c.locationStats).map(loc => ({
            name: loc.name,
            audience: loc.totalAudience + (multiplier > 1 ? Math.floor(loc.totalAudience * multiplier * (Math.random() + 0.5)) : 0),
            attention: loc.eventsCount > 0 ? +(loc.totalAttentionSeconds / loc.eventsCount).toFixed(1) : 0
        }));

        return {
            ...c,
            locations: processedLocations, // Swap simple strings with objects containing full stats
            audienceLog: c.audienceLog,    // Pass to frontend
            averageAttentionTime: c.eventsCount > 0 ? (c.totalAttentionSeconds / c.eventsCount) : 0, // Calculate average
            // Scale the numbers purely for visual mock effect
            displayAudience: c.totalAudience + (multiplier > 1 ? Math.floor(c.totalAudience * multiplier * (Math.random() + 0.5)) : 0)
        };
    });
    
    // Overall Stats
    const totalAudience = Object.values(campaigns).reduce((acc, c) => acc + c.totalAudience, 0);
    const overallAudience = totalAudience + (multiplier > 1 ? Math.floor(totalAudience * multiplier) : 0);
    
    // Average overall Attention Time
    const activeCampaigns = campaignsList.filter(c => c.eventsCount > 0);
    let overallAttention = 0;
    if (activeCampaigns.length > 0) {
        overallAttention = activeCampaigns.reduce((acc, c) => acc + c.averageAttentionTime, 0) / activeCampaigns.length;
    }

    // Generate AI Insight Summary
    let topCampaignName = "";
    let topAudience = 0;
    campaignsList.forEach(c => {
        if (c.displayAudience > topAudience) {
            topAudience = c.displayAudience;
            topCampaignName = c.name;
        }
    });

    let timeText = scale === 'day' ? 'hari ini' : (scale === 'week' ? 'minggu ini' : 'bulan ini');
    let insightSummary = campaignsList.length === 0 
        ? "Sedang mengumpulkan data audiens..." 
        : `Sepanjang ${timeText}, interaksi audiens terpantau aktif dengan puncak minat tertinggi pada kampanye "${topCampaignName || 'Berbagai Iklan'}". Retensi perhatian penonton rata-rata stabil di angka ${overallAttention.toFixed(1)} detik.`;

    res.json({
        scale,
        overallAudience,
        overallAttention,
        insightSummary,
        campaigns: campaignsList,
        chartData,
        recentEvents: recentEvents.slice(0, 10)
    });
});

app.listen(PORT, () => {
    console.log(`Backend running on port ${PORT}`);
});
