const express = require('express');
const mongoose = require('mongoose');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());

// Connect to MongoDB
mongoose.connect(process.env.MONGODB_URI)
  .then(() => console.log('Connected to MongoDB Atlas'))
  .catch(err => console.error('Could not connect to MongoDB Atlas', err));

// Define routes
app.get('/', (req, res) => {
  res.send('Express server with MongoDB Atlas connection');
});

// Create a simple schema and model example
const userSchema = new mongoose.Schema({
  name: String,
  email: String,
  date: { type: Date, default: Date.now }
});

const User = mongoose.model('User', userSchema);

// Example route to create a user
app.post('/api/users', async (req, res) => {
  const user = new User({
    name: req.body.name,
    email: req.body.email
  });
  
  try {
    const result = await user.save();
    res.status(201).send(result);
  } catch (error) {
    res.status(400).send(error.message);
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
