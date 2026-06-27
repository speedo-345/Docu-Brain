import { Response, Request } from 'express';
import { sendFileToAI, searchAI, deleteFileFromAI, getProcessingStatus } from '../services/aiService';
import { AuthRequest } from '../middleware/authMiddleware';
import Document from '../models/Document';
import Message from '../models/Message';
import fs from 'fs';
import path from 'path';


export const uploadDocument = async (req: AuthRequest, res: Response): Promise<void> => {

    try {

        if (!req.file) {
            res.status(400).json({ error: 'No file uploaded' })
            return;
        }

        if (!req.user) {
            res.status(400).json({ error: 'User not found' })
            return;
        }

        const filePath = req.file.path;
        const filename = req.file.filename;
        const originalName = req.file.originalname || filename;

        // ── ASYNC PIPELINE: Create doc immediately with 'processing' status ──
        const newDoc = await Document.create({
            userId: req.user._id,
            filename: filename,
            originalName: originalName,
            fileUrl: filePath,
            status: 'processing'
        });

        // Return immediately — the client can now redirect to the viewer
        res.json({
            message: 'Uploading',
            filename: filename,
            originalName: originalName,
            docId: newDoc._id
        });

        // ── Fire-and-forget: AI processing in background ──
        sendFileToAI(filePath, filename, req.user._id.toString())
          .then(async (aiResponse) => {
              if (aiResponse && aiResponse.error) {
                  console.error("AI processing returned error:", aiResponse.error);
                  await Document.updateOne({ _id: newDoc._id }, { status: 'failed' });
              } else {
                  await Document.updateOne({ _id: newDoc._id }, { status: 'ready' });
              }
          })
          .catch(async (err) => {
              console.error("AI processing failed:", err);
              await Document.updateOne({ _id: newDoc._id }, { status: 'failed' });
          });

    } catch (error) {
        console.error("Upload Error:", error);
        
        // Clean up the orphaned file if the AI processing fails
        if (req.file && req.file.path && fs.existsSync(req.file.path)) {
            try {
                fs.unlinkSync(req.file.path);
            } catch (fsError) {
                console.error("Failed to clean up file after upload error:", fsError);
            }
        }

        res.status(500).json({ error: 'Failed to process document' });
    }
};

export const getDocumentStatus = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const { docId } = req.params;
        const doc = await Document.findById(docId).select('status filename');
        
        if (!doc) {
            res.status(404).json({ error: 'Document not found' });
            return;
        }

        let stage = null;
        // If still processing, poll the AI engine for granular stage info
        if (doc.status === 'processing') {
            try {
                stage = await getProcessingStatus(doc.filename);
            } catch {
                // AI engine may be down — just return the MongoDB status
            }
        }

        res.json({ status: doc.status, stage });
    } catch (error) {
        console.error("Status check error:", error);
        res.status(500).json({ error: 'Failed to check status' });
    }
};

export const retryDocument = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const { docId } = req.params;
        const doc = await Document.findById(docId);
        
        if (!doc) {
            res.status(404).json({ error: 'Document not found' });
            return;
        }

        if (doc.status !== 'failed') {
            res.status(400).json({ error: 'Only failed documents can be retried' });
            return;
        }

        if (!doc.fileUrl || !fs.existsSync(doc.fileUrl)) {
            res.status(400).json({ error: 'Original file no longer exists on server. Please re-upload.' });
            return;
        }

        // Reset status
        await Document.updateOne({ _id: docId }, { status: 'processing' });
        res.json({ message: 'Retry started' });

        // Fire-and-forget: AI processing in background
        sendFileToAI(doc.fileUrl, doc.filename, req.user._id.toString())
          .then(async (aiResponse) => {
              if (aiResponse && aiResponse.error) {
                  console.error("AI processing returned error on retry:", aiResponse.error);
                  await Document.updateOne({ _id: docId }, { status: 'failed' });
              } else {
                  await Document.updateOne({ _id: docId }, { status: 'ready' });
              }
          })
          .catch(async (err) => {
              console.error("AI processing failed on retry:", err);
              await Document.updateOne({ _id: docId }, { status: 'failed' });
          });

    } catch (error) {
        console.error("Retry Error:", error);
        res.status(500).json({ error: 'Failed to initiate retry' });
    }
};

export const searchDocument = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const { query, docId } = req.body;

        if (!query) {
            res.status(400).json({ error: 'query not found' })
            return;
        }
        if(!docId){
            res.status(400).json({error: "Document ID is required"});
            return;
        }

        const doc = await Document.findById(docId);
        if (!doc) {
            res.status(404).json({ error: "Document not found" });
            return;
        }

        const userMsg = await Message.create({
            documentId: docId,
            role: 'user',
            content: query,
        });
        
        // Fetch last 6 messages (excluding the one we just created)
        const recentMessages = await Message.find({ documentId: docId, role: { $ne: 'system' }, _id: { $ne: userMsg._id } })
            .sort({ createdAt: -1 })
            .limit(6)
            .lean();
            
        const history = recentMessages.reverse().map(msg => ({
            role: msg.role,
            content: msg.content
        }));

        const searchData = await searchAI(query.toString(), doc.filename, req.user._id.toString(), history);

        if (searchData && searchData.error) {
            throw new Error(searchData.error);
        }

        const results = searchData.results || [];

        let aiResponseContent= searchData.answer || "I couldn't find relevant info.";
        let sources:any[]=[];

        //sources for db
        if(results && results.length>0){

            sources= results.map((r:any)=>({
                textSnippet:r.text.substring(0, 100),
                score: r.score,
                pageNumber: typeof r.page === 'number' ? r.page : (!isNaN(parseInt(r.page)) ? parseInt(r.page) : 1),
                filename: r.filename || null
            }));
        }

        const aiMessage= await Message.create({
            documentId: docId,
            role: 'assistant',
            content: aiResponseContent,
            sources: sources
        });

        res.json({
            answer: aiResponseContent,
            sources: sources
        });
      

    } catch (error) {
        console.error("Failed to search query: ", error);

        res.status(500).json({ error: 'Internal Server Error' });
    }
};


export const getDocumentChat=async(req: AuthRequest, res: Response):Promise<void>=>{

    try{
        const {docId}= req.params;
        const userId= req.user._id;

        const limit= parseInt(req.query.limit as string) || 50;
        const before= req.query.before as string;

        const doc= await Document.findOne({_id: docId, userId: userId}) ;

        if (!doc) {

            res.status(404).json({error: 'Document not found'});
            return;
        }

        let query:any={documentId: docId};

        if(before){ 
            query.createdAt={$lt: new Date(before)};
        }

        const messages= await Message.find(query).sort({createdAt:-1}).limit(limit).lean();

        res.json(messages.reverse());
    }catch(error){
        res.status(500).json({error: "Failed to fetch chats"});
    }
};

export const getUserDocuments= async(req: AuthRequest, res: Response)=>{
    try{
        const userId= req.user._id;

        const docs= await Document.find({userId}).select('filename originalName _id createdAt status')
        .sort({createdAt:-1});

        res.json(docs);

    }catch(error){
        console.error(error, "failed to fatch documents");
        res.status(500).json({error: 'Failed to fetch documents'});
    }
};

export const deleteDocument=async(req:AuthRequest, res: Response)=>{
    try{
       

        const {docId}=req.params;
        const userId= req.user._id;

        const docExist= await Document.findOne({_id: docId, userId});


        if (!docExist) {
            res.status(404).json({ error: 'Document not found' });
            return;
        }

        // ── Delete file from disk ──
        if(docExist.fileUrl && fs.existsSync(docExist.fileUrl)){
            fs.unlinkSync(docExist.fileUrl);
        }

        // ── Delete vectors from Pinecone (surface failures) ──
        const aiDeleted = await deleteFileFromAI(docExist.filename);
        if (aiDeleted === false) {
            console.warn("⚠️ Pinecone vector cleanup failed — vectors may be orphaned for:", docExist.filename);
        }

        // ── Delete chat history and document record ──
        await Message.deleteMany({documentId: docId});
        await Document.deleteOne({_id: docId});

        res.json({ message: 'Document deleted successfully' });
        
    }catch(error){
        console.error(error, "Failed to delete document");
        res.status(500).json({error: 'Failed to delete document'});
    }
}

