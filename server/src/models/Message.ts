import mongoose, { Document, Model, Schema, Types } from 'mongoose';

export interface IMessage extends Document {
    documentId: Types.ObjectId; 
    role: "user" | "assistant";
    content: string; 
    sources: {
        pageNumber: number;
        textSnippet: string;
        score: number;
    }[];
    createdAt: Date;
    updatedAt: Date;
}

const MessageSchema = new Schema<IMessage>({
    documentId: {
        type: Schema.Types.ObjectId,
        required: true,
        ref: 'Document',
        index: true
    },
    role: {
        type: String,
        enum: ['user', 'assistant'],
        required: true
    },
    content: {
        type: String,
        required: true
    },
    sources: [
        {
            pageNumber: Number,
            textSnippet: String,
            score: Number
        }
    ]
}, { timestamps: true });


const Message: Model<IMessage> = mongoose.models.Message || mongoose.model<IMessage>('Message', MessageSchema);

export default Message;