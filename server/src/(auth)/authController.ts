import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { Request, Response } from 'express';
import User from '../models/User';


export const Register=async (req: Request, res: Response): Promise<void> => {
    try {

        const { username, email, password } = req.body;

        if (!username || !email || !password) {
            res.status(400).json({ error: "please fill all the fields" });
            return;
        }

        const userExists = await User.findOne({email });

        if (userExists) {
            res.status(400).json({ error: "User already exists" });
            return;
        }


        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        const newUser = await User.create({
            username,
            email,
            password: hashedPassword
        });

        if(newUser){
            const token= jwt.sign(
                {id: newUser._id},
                process.env.JWT_SECRET as string,
                {expiresIn: '30d'}
            );
            res.status(201).json({
                _id: newUser._id,
                username: newUser.username,
                email: newUser.email,
                token:token
            });

        }else{
            res.status(400).json({ error: "Invalid user data" });
        }



    } catch (error: any) {
        console.error(error);
        res.status(500).json({ error: "Server Error" });
    }

};

export const Login=async(req: Request, res: Response):Promise<void>=>{
    try{
        const {email, password}=req.body;

        const user= await User.findOne({email});

        if(user && (await bcrypt.compare(password, user.password))){
            const token= jwt.sign(
                {id: user._id},
                process.env.JWT_SECRET as string,
                {expiresIn: '7d'}
            );

            res.json({
                _id: user._id,
                username: user.username,
                email: user.email,
                token: token
            });
        }else{
            res.status(400).json({ error: "Invalid credentials" });
        }
    }catch (error) {
        res.status(500).json({ error: "Server Error" });
    }
};

