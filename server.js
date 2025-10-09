// Aurora Bistro Tombola server (minimal bootable version)
const express = require('express');
const path = require('path');

const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// serve static files from /public
app.use(express.static(path.join(__dirname, 'public')));

// explicit homepage route
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// required for Render
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log('Aurora Tombola listening on ' + PORT));
