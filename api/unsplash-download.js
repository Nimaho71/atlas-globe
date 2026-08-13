// Unsplash requires apps to hit the download endpoint whenever a user actually
// uses a photo — it's how photographers get credited with a view/download in
// their stats, and it's a condition of production access.
//
// The site itself has no API key by design (see PLAN.md §4), so the browser
// calls this function instead and the key stays server-side in Vercel's env.
//
//   GET /api/unsplash-download?id=<unsplash photo id>
//
// Fire-and-forget: the response carries nothing the page needs.

const ID = /^[A-Za-z0-9_-]{5,32}$/;   // Unsplash ids, nothing else

export default async function handler(req, res) {
    const id = req.query?.id;

    if (!id || !ID.test(id)) {
        res.status(400).json({ error: 'bad id' });
        return;
    }

    const key = process.env.UNSPLASH_ACCESS_KEY;
    if (!key) {
        // Don't fail the page over telemetry; log so it's visible in Vercel.
        console.error('UNSPLASH_ACCESS_KEY missing — download not tracked');
        res.status(204).end();
        return;
    }

    try {
        const r = await fetch(`https://api.unsplash.com/photos/${id}/download`, {
            headers: { Authorization: `Client-ID ${key}`, 'Accept-Version': 'v1' },
        });
        if (!r.ok) console.error(`unsplash download ${id}: ${r.status}`);
    } catch (err) {
        console.error(`unsplash download ${id}:`, err.message);
    }

    res.status(204).end();
}
