server.jsconst express = require('express');
const multer = require('multer');
const { exec } = require('child_process');
const path = require('path');
const fs = require('fs');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.static('public'));

const upload = multer({ dest: 'uploads/' });

app.post('/convert', upload.single('image'), (req, res) => {
  const inputPath = req.file.path;
  const outputPath = `outputs/${req.file.filename}.svg`;

  const command = `vtracer --input ${inputPath} --output ${outputPath} --colormode color --filter_speckle 4 --color_precision 6`;

  exec(command, (error, stdout, stderr) => {
    if (error) {
      console.error(error);
      return res.status(500).send('Conversion failed');
    }

    res.download(outputPath);
  });
});

app.listen(3000, () => console.log('Server running'));
