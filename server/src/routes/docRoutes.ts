import {Router} from 'express';
import {upload} from '../middleware/upload'
import { uploadDocument, searchDocument, getDocumentChat, getUserDocuments, getDocumentStatus, retryDocument } from '../controllers/docController';
import { protect } from '../middleware/authMiddleware';
import { deleteDocument } from '../controllers/docController';


const router= Router();


router.post('/upload',protect,  upload.single('pdf'), uploadDocument);

router.post('/search',protect,  searchDocument)

router.get('/:docId/chat', protect, getDocumentChat);

router.get('/:docId/status', protect, getDocumentStatus);
router.post('/:docId/retry', protect, retryDocument);

router.get('/list', protect, getUserDocuments);

router.delete('/:docId', protect, deleteDocument);

export default router;