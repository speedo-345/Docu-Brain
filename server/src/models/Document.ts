import mongoose, { Document, Model, Schema, Types } from 'mongoose';

export interface IDocument extends Document {
    userId: Types.ObjectId; 
    filename: string;
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