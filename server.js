const express = require('express');
const cors = require('cors');
const { createClient } = require('@supabase/supabase-js');
const { Resend } = require('resend');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3001;

// Initialize Supabase and Resend using your .env values
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);
const resend = new Resend(process.env.RESEND_API_KEY);

app.use(cors());
app.use(express.json()); 


// ==========================================
// 1. POST /api/bookings — THE CORE ENDPOINT
// ==========================================
app.post('/api/bookings', async (req, res) => {
  const {
    chef_id, user_name, user_email, user_phone,
    user_address, user_lat, user_lng,
    booking_date, start_time, hours, total_amount,
    payment_id
  } = req.body;

  try {
    // A. Save the booking details into the Supabase database
    const { data: booking, error: dbError } = await supabase
      .from('bookings')
      .insert([{
        chef_id, user_address, user_lat, user_lng,
        booking_date, start_time, hours, total_amount,
        payment_id, status: 'confirmed'
      }])
      .select()
      .single();

    if (dbError) throw dbError;
    

    // B. Pull the selected chef's details from the database (to get their name/email)
    const { data: chef, error: chefError } = await supabase
      .from('chefs')
      .select('*')
      .eq('id', chef_id)
      .single();

    if (chefError) throw chefError;

    // C. Send a confirmation email to the user who booked
    await sendUserConfirmation({ user_name, user_email, chef, booking });

    // D. Send an order notification email to the Chef with a Google Maps link
    await notifyChef({ chef, booking, user_name, user_phone, user_lat, user_lng, user_address });

    // Send success back to your frontend
    res.json({ success: true, booking_id: booking.id });

  } catch (error) {
    console.error("Booking error:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ==========================================
// 2. HELPER FUNCTION: SEND USER EMAIL
// ==========================================
async function sendUserConfirmation({ user_name, user_email, chef, booking }) {
  const formattedDate = new Date(booking.booking_date).toLocaleDateString('en-IN', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
  });

  await resend.emails.send({
    from: 'ChefConnect <bookings@genzchef.work.gd>',
    to: user_email,
    subject: `✅ Booking confirmed — ${chef.name} on ${formattedDate}`,
    html: `
      <div style="font-family: sans-serif; max-width: 500px; margin: 0 auto; border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden;">
        <div style="background: #E8622A; padding: 20px; text-align: center; color: white;">
          <h2>🎉 Booking Confirmed!</h2>
        </div>
        <div style="padding: 20px; background: #fafafa;">
          <p>Hi ${user_name}, your chef is officially booked.</p>
          <hr style="border: none; border-top: 1px solid #e2e8f0;" />
          <p><strong>Chef:</strong> ${chef.name}</p>
          <p><strong>Date:</strong> ${formattedDate}</p>
          <p><strong>Time:</strong> ${booking.start_time}</p>
          <p><strong>Duration:</strong> ${booking.hours} hours</p>
          <p><strong>Total Paid:</strong> ₹${booking.total_amount}</p>
        </div>
      </div>
    `
  });
}

// ==========================================
// 3. HELPER FUNCTION: NOTIFY CHEF (WITH MAPS)
// ==========================================
async function notifyChef({ chef, booking, user_name, user_phone, user_lat, user_lng, user_address }) {
  const chefEarning = Math.round(booking.total_amount * 0.85); // 15% platform commission platform fee
  
  // Create a dynamic Google Maps link using GPS coordinates if available, otherwise fallback to text address
  const mapsLink = user_lat && user_lng
    ? `https://www.google.com/maps?q=${user_lat},${user_lng}`
    : `https://www.google.com/maps/search/${encodeURIComponent(user_address)}`;

  await resend.emails.send({
    from: 'ChefConnect <orders@genzchef.work.gd>',
    to: chef.email || 'your-fallback-chef-email@domain.com', // fallback for testing
    subject: `🍳 New Booking Received from ${user_name}!`,
    html: `
      <div style="font-family: sans-serif; max-width: 500px; margin: 0 auto; border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden;">
        <div style="background: #1c1917; padding: 20px; text-align: center; color: #F4A278;">
          <h2>🍳 New Order Assigned!</h2>
        </div>
        <div style="padding: 20px; background: #fafafa;">
          <p><strong>Customer:</strong> ${user_name}</p>
          <p><strong>Phone:</strong> ${user_phone}</p>
          <p><strong>Address:</strong> ${user_address}</p>
          <p><strong>Your Earnings:</strong> ₹${chefEarning}</p>
          <br />
          <a href="${mapsLink}" style="display: block; background: #E8622A; color: white; text-align: center; padding: 12px; text-decoration: none; border-radius: 5px; font-weight: bold;">
            📍 Open Customer Location in Google Maps
          </a>
        </div>
      </div>
    `
  });
}

// Start the server
app.listen(PORT, () => {
  console.log(`🚀 ChefConnect Server running on http://localhost:${PORT}`);
});