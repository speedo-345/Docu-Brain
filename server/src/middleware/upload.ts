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

const fileFilter=(req: any, file: Express.Multer.File, cb: multer.FileFilterCallback)=>{

    const allowedTypes=[
        'application/pdf'
       
    ];

    if (allowedTypes.includes(file.mimetype)) {
        cb(null, true);
    }else{
        cb(new Error('only PDF files are allowed!'))
    }
};

export const upload =multer({
    storage: storage,
    fileFilter: fileFilter,
    limits:{fileSize: 10*1024*1024}
});