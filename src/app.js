import express from 'express'
import cors from 'cors'
import cookieParser from 'cookie-parser'

const app = express()

app.get('/', (req, res) => {
  res.send('Hello, Express!');
})

app.use(
  cors({
    origin: ['http://localhost:3000', "https://tto-platform-blush.vercel.app"], // Allow specific frontend origin
    methods: ['POST', 'PUT', 'GET', 'OPTIONS', 'HEAD'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true, // Allow credentials
  })
);

app.use(express.json())
app.use(cookieParser())
app.use(express.urlencoded({ extended: true, limit: '16kb' }))
app.use(express.static('public'))
app.use((err, req, res, next) => {
  const statusCode = err.status || 500;
  res.status(statusCode).json({
    message: err.message || "Internal Server Error",
    stack: process.env.NODE_ENV === "production" ? null : err.stack,
  });
});


// router import
import userRouter from "./routes/user.routes.js"

app.use("/api/v1/users", userRouter)

export {
  app
}