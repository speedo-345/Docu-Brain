import {Request, Response, NextFunction} from 'express';
import jwt from 'jsonwebtoken';
import User from '../models/User';


export interface AuthRequest extends Request{
    user?: any;//express's req object does not have a .user property. I f you try to write req.user= decoded then typescript will throw an error
}

export const protect= async(req: AuthRequest, res: Response, next: NextFunction)=>{

    let token;
    if(req.headers.authorization && req.headers.authorization.startsWith('Bearer')){
        try{
            token= req.headers.authorization.split(' ')[1];

            const decoded: any= jwt.verify(token, process.env.JWT_SECRET as string);

            req.user= (await User.findById(decoded.id)).isSelected('-password');

            next();
        }catch(error){
            console.error(error);
            res.status(401).json({error:'Not authorized, token failed'});
        }
    }

    if(!token){
        res.status(401).json({error: 'Not authorized, no token'});
    }
};