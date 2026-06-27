import mongoose, { Document, Model, Schema, Types } from 'mongoose';

export interface IDocument extends Document {
    userId: Types.ObjectId; 
    filename: string;       // Multer-generated disk filename (e.g., "1782421534322-563834334.pdf")
    originalName: string;   // Human-readable original filename (e.g., "MyReport.pdf")
    fileUrl: string;
    status: 'pending' | 'processing' | 'ready' | 'failed';
    vectorId?: string; 
    createdAt: Date;
    updatedAt: Date;
}

const DocumentSchema = new Schema<IDocument>({
    userId: {
        type: Schema.Types.ObjectId,
        required: true,
        ref: 'User',
        index: true
    },
    filename: {
        type: String,
        required: true,
        trim: true
    },
    originalName: {
        type: String,
        required: false,
        trim: true
    },
    fileUrl: {
        type: String,
        required: true,
        trim: true
    },
    status: {
        type: String,
        enum: ['pending', 'processing', 'ready', 'failed'],
        default: 'pending',
        index: true 
    },
    vectorId: {
        type: String,
        required: false
    }
}, { timestamps: true });


const DocModel: Model<IDocument> = mongoose.models.Document || mongoose.model<IDocument>('Document', DocumentSchema);

export default DocModel;