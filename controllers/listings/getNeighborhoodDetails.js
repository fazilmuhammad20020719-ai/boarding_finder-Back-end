const { query } = require("../../db");

// Helper function to generate mock POIs based on a coordinate
const generateMockPOIs = (lat, lng, listingId) => {
  // Use listingId to seed the pseudo-random generation so it's consistent for the same listing
  const seed = parseInt(listingId) || 1;
  const pseudoRandom = (modifier) => {
    return Math.abs(Math.sin(seed * modifier));
  };

  const categories = [
    { name: "Education", items: ["City University Campus", "Downtown Public Library", "Science Academy", "Arts Institute"] },
    { name: "Transit", items: ["Central Station", "Oak Street Bus Stop", "Metro Train Line", "Main Transit Hub"] },
    { name: "Groceries", items: ["Fresh Market Grocery", "SuperSaver Mart", "Daily Needs Store", "Local Produce Market"] },
    { name: "Healthcare", items: ["General Hospital", "City Medical Center", "Community Clinic", "Health Plus Pharmacy"] }
  ];

  const pois = [];
  let idCounter = 1;

  // Generate 2 POIs for each category
  categories.forEach((cat, catIndex) => {
    for (let i = 0; i < 2; i++) {
      // Deterministic pseudo-random offsets
      const latOffset = (pseudoRandom(idCounter * 10) - 0.5) * 0.015;
      const lngOffset = (pseudoRandom(idCounter * 20) - 0.5) * 0.015;
      
      const distanceMin = Math.floor(pseudoRandom(idCounter * 30) * 15) + 2; // 2 to 17 mins
      
      const itemIndex = Math.floor(pseudoRandom(idCounter * 40) * cat.items.length);
      
      pois.push({
        id: idCounter,
        name: cat.items[itemIndex],
        category: cat.name,
        distance: `${distanceMin} min walk`,
        time: distanceMin,
        latitude: parseFloat(lat) + latOffset,
        longitude: parseFloat(lng) + lngOffset
      });
      
      idCounter++;
    }
  });

  return pois;
};

const getNeighborhoodDetails = async (req, res) => {
  const { id } = req.params;

  try {
    const result = await query(
      `SELECT listing_id, title, location, latitude, longitude 
       FROM listings 
       WHERE listing_id = $1`,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Listing not found" });
    }

    const listing = result.rows[0];
    
    // If no coordinates exist in DB, provide defaults (e.g. center of Colombo, Sri Lanka)
    const lat = listing.latitude || 6.927079;
    const lng = listing.longitude || 79.861244;

    const pois = generateMockPOIs(lat, lng, listing.listing_id);

    res.json({
      listing: {
        id: listing.listing_id,
        title: listing.title,
        location: listing.location,
        latitude: lat,
        longitude: lng
      },
      pois
    });
  } catch (err) {
    console.error("Error fetching neighborhood details:", err);
    res.status(500).json({ error: "Server error fetching neighborhood details" });
  }
};

module.exports = { getNeighborhoodDetails };
