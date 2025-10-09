// Aurora Bistro Tombola server
const express = require('express');
const path = require('path');
const bodyParser = require('body-parser');   // keep if you use it
const sqlite3 = require('sqlite3').verbose(); // keep if you use SQLite locally
const crypto = require('crypto');

const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// serve /public
app.use(express.static(path.join(__dirname, 'public')));

// explicit homepage route
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});
