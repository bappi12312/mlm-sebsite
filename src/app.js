import express from 'express'
import cors from 'cors'
import cookieParser from 'cookie-parser'

const app = express()

app.get('/',(req,res) => {
  res.send('Hello, Express!');
})

app.use(
  cors({
    origin: ['http://localhost:3000'], // Allow specific frontend origin
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
    credentials: true, // Allow credentials
  })
);
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(err.status || 500).json({
    message: err.message || "occur an error",
  });
});

app.use(express.json())
app.use(cookieParser())
app.use(express.urlencoded({extended: true,limit: '16kb'}))
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

app.use("/api/v1/users",userRouter)

export {
  app
}