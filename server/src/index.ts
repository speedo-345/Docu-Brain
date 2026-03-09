import 'dotenv/config';
import express, { Request, Response } from 'express';
import cors from 'cors';
import axios from 'axios';
import docRoutes from './routes/docRoutes'
import path from 'path';


const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(express.json());
app.use(cors({
    origin: "http://localhost:3000",
    credentials: true
  }));

app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

app.use('/api/docs', docRoutes);


app.listen(PORT, () => {
    console.log(`🚀 Server running on http://localhost:${PORT}`);
});