const express = require('express');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = 3000;

// Serve static files from frontend directory
app.use(express.static(path.join(__dirname, 'frontend')));

// Log all requests for debugging
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);
  next();
});

app.listen(PORT, () => {
  console.log(`\n🚀 Local development server running at http://localhost:${PORT}`);
  console.log('\n📝 How to use:');
  console.log('1. Edit files in cdk/frontend/');
  console.log('2. Refresh browser to see changes');
  console.log('3. Open DevTools Console for debugging');
  console.log('4. When ready, deploy with: npm run deploy\n');
});