// server.js
const express = require('express');
const { Client } = require('@elastic/elasticsearch');

const app = express();
app.use(express.json());

// Elasticsearch client
const client = new Client({
  node: 'https://localhost:9200',
  auth: {
    username: 'elastic',
    password: '9oWDWZqK5R=ZMI4Ej_mt'
  },
  tls: { rejectUnauthorized: false }
});

// Ensure indexes exist
async function ensureIndexes() {
  const indexes = ['products', 'inventory', 'vendors'];
  for (const index of indexes) {
    const exists = await client.indices.exists({ index });
    if (!exists) {
      await client.indices.create({ index });
      console.log(`✅ Created '${index}' index`);
    }
  }
}
ensureIndexes();

// API to insert/update documents
app.post('/sync/:index', async (req, res) => {
  try {
    const indexName = req.params.index;
    const docs = req.body.docs;

    if (!Array.isArray(docs)) {
      return res.status(400).json({ error: "docs should be an array" });
    }

    const bulkBody = docs.flatMap(doc => [
      { index: { _index: indexName } },
      doc
    ]);

    await client.bulk({ refresh: true, body: bulkBody });

    res.json({ message: `📦 Synced ${docs.length} docs to ${indexName}` });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error.message });
  }
});

// API to delete missing docs based on new dataset
app.post('/delete-missing/:index', async (req, res) => {
  try {
    const indexName = req.params.index;
    const oldDocs = req.body.oldDocs;
    const newDocs = req.body.newDocs;

    if (!Array.isArray(oldDocs) || !Array.isArray(newDocs)) {
      return res.status(400).json({ error: "oldDocs and newDocs must be arrays" });
    }

    const deleted = oldDocs.filter(
      old => !newDocs.some(newDoc => newDoc.name === old.name)
    );

    for (const del of deleted) {
      await client.deleteByQuery({
        index: indexName,
        body: { query: { match: { name: del.name } } }
      });
    }

    res.json({ message: `🗑 Deleted ${deleted.length} docs from ${indexName}`, deleted });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error.message });
  }
});

// Search across products, inventory, vendors
app.get('/search', async (req, res) => {
  try {
    const queryText = req.query.q || '';

    const results = await client.search({
      index: 'products,inventory,vendors',
      query: queryText
        ? { multi_match: { query: queryText, fields: ['name', 'product', 'vendor'] } }
        : { match_all: {} }
    });

    res.json(results.hits.hits.map(hit => ({
      index: hit._index,
      ...hit._source
    })));
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error.message });
  }
});


// Get all documents from all indexes
app.get('/all', async (req, res) => {
    try {
      const results = await client.search({
        index: 'products,inventory,vendors',
        size: 1000, // adjust if you expect more than 1000 docs
        query: { match_all: {} }
      });
  
      res.json(results.hits.hits.map(hit => ({
        index: hit._index,
        ...hit._source
      })));
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: error.message });
    }
  });
  
// Start server
app.listen(3000, () => {
  console.log('🚀 Server running on http://localhost:3000');
});
