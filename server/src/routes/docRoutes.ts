import {Router} from 'express';
import {upload} from '../middleware/upload'
import { uploadDocument, searchDocument, getDocumentChat, getUserDocuments } from '../controllers/docController';
import { protect } from '@/middleware/authMiddleware';
import { deleteDocument } from '../controllers/docController';


const router= Router();


router.post('/upload',protect,  upload.single('pdf'), uploadDocument);

router.post('/search',protect,  searchDocument)

router.get('/:docId/chat', protect, getDocumentChat);

router.get('/list', protect, getUserDocuments);

router.delete('/:docId', protect, deleteDocument);

export default router;