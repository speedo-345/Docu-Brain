import multer from 'multer';
import path from 'path';
import fs from 'fs';

const uploadDir= path.join(__dirname, '../../uploads');
if(!fs.existsSync(uploadDir)){
    fs.mkdirSync(uploadDir, {recursive: true});
}

const storage= multer.diskStorage({
    destination: (req, file, cb)=>{
        cb(null, uploadDir);
    },
    filename:(req, file, cb)=>{
        const uniqueSuffix= Date.now()+ '-'+ Math.round(Math.random()* 1E9);
        cb(null, uniqueSuffix+ path.extname(file.originalname));
    }
});

const fileFilter = (req: any, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
    // Windows browsers sometimes send different mime types or empty
    if (file.mimetype === 'application/pdf' || file.originalname.toLowerCase().endsWith('.pdf')) {
        cb(null, true);
    } else {
        cb(new Error('only PDF files are allowed!'));
    }
};

export const upload =multer({
    storage: storage,
    fileFilter: fileFilter,
    limits:{fileSize: 10*1024*1024}
});