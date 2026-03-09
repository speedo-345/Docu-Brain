import { Response, Request } from 'express';
import { sendFileToAI, searchAI, deleteFileFromAI } from '../services/aiService';
import { AuthRequest } from '@/middleware/authMiddleware';
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

        const aiResponse = await sendFileToAI(filePath, filename);

        const newDoc = await Document.create({
            userId: req.user._id,
            filename: filename,
            fileUrl: filePath,

            status: 'indexed'
        });

        res.json({
            message: 'Processed successfully',
            filename: filename,   // ← the actual saved filename on disk
            data: aiResponse,
            docId: newDoc._id
        });

    } catch (error) {
        res.status(500).json({ error: 'Failed to process document' });
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

        await Message.create({
            documentId: docId,
            role: 'user',
            content: query,
        })
        
        const results = await searchAI(query.toString())

        let aiResponseContent= "I couldn't find relevant info.";
        let sources=[];

        //sources for db
        if(results && results.length>0){
            aiResponseContent=results.map((r:any)=>r.text).join('\n\n');

            sources= results.map((r:any)=>({
                textSnippet:r.text.substring(0, 100),
                score: r.score,
                pageNumber: r.pageNumber || 1 
            }));
        }

        const aiMessage= await Message.create({
            documentId: docId,
            role: 'assistant',
            content: aiResponseContent,
            sources: sources
        });

        res.json(results);
      

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

        const messages= await Message.find({query}).sort({createdAt:-1}).limit(limit).lean();

        res.json(messages.reverse());
    }catch(error){
        res.status(500).json({error: "Failed to fetch chats"});
    }
};

export const getUserDocuments= async(req: AuthRequest, res: Response)=>{
    try{
        const userId= req.user._id;

        const docs= await Document.find({userId}).select('filename _id createdAt status')
        .sort({createdAt:-1});

        res.json(docs);

    }catch(error){
        console.error(error, "failed to fatch documents");
        res.status(500).json({error: 'Failed to fetch documents'});
    }
};

export const deleteDocument=async(req:AuthRequest, res: Response)=>{
    try{
       

        const {id}=req.params;
        const userId= req.user._id;

        const docExist= await Document.findOne({_id: id, userId});


        if (!docExist) {
            res.status(404).json({ error: 'Document not found' });
            return;
        }

        if(docExist.fileUrl && fs.existsSync(docExist.fileUrl)){
            fs.unlinkSync(docExist.fileUrl);
        }
        await deleteFileFromAI(docExist.filename);

        await Message.deleteMany({docuemntId: id});

        await Document.deleteOne({_id: id});

        res.json({ message: 'Document deleted successfully' });
        
    }catch(error){
        console.error(error, "Failed to delete document");
        res.status(500).json({error: 'Failed to delete document'});
    }
}

