const router = require('express').Router();

router.get('/', (req, res) => {
  res.json({ success: true, message: 'pong', time: Date.now() });
});

module.exports = router;
