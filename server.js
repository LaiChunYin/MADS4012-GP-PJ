const express = require("express");
const app = express();
const HTTP_PORT = process.env.PORT || 8080;


// using handlebars
const exphbs = require('express-handlebars');
app.engine('.hbs', exphbs.engine({ extname: '.hbs' }));
app.set('view engine', '.hbs');

// server static files
app.use(express.static("assets"))
app.use(express.urlencoded({ extended: true }))

const mongoose = require("mongoose");
const dbName = "MADS4012-Project"
const password = "3ltAmn86F98usTkk"
const CONNECTION_STRING = `mongodb+srv://101470580:${password}@cluster0.vawi6nl.mongodb.net/${dbName}?retryWrites=true&w=majority`;

mongoose.connect(CONNECTION_STRING);

const db = mongoose.connection;
db.on("error", console.error.bind(console, "Error connecting to database: "));
db.once("open", () => {
  console.log("Mongo DB connected successfully.");
});

// -----------DB Schema and Models-----------------
const Schema = mongoose.Schema;
const driverSchema = new Schema({
  username: String,
  password: String,
  fullName: String,
  vehicleModel: String,
  color: String,
  licensePlate: String,
});
const menuItemSchema = new Schema({
  name: String,
  image: String,
  description: String,
  price: Number,
});
const orderSchema = new Schema({
  customerName: String,
  deliveryAddress: String,
  items: [String],
  orderTime: Date,
  status: String,
});

const Driver = mongoose.model("driver_collection", driverSchema);
const MenuItem = mongoose.model("menu_item_collection", menuItemSchema);
const Order = mongoose.model("order_collection", orderSchema);


const onHttpStart = () => {
  console.log(`Express web server running on port: ${HTTP_PORT}`);
  console.log(`Press CTRL+C to exit`);
};


/// -----------------Restaurant APIs--------------------------------------
app.get("/", (req, res) => {
  return res.send('Welcome')
})

app.get("/menuItems", (res, req) => {

})

app.post("/order", (res, req) => {

})

app.get("/orderStatus", (res, req) => {

})

/// -----------------Order Processing APIs--------------------------------------

const handleLoad = (status) => {
  const list = ['Ready', 'Received', 'Transit', 'Delivered']

  let listT = []

  listT = [status]
  for (var i = 0; i < list.length; i++) {

    if (status !== list[i]) {
      listT.push(list[i])
    }
  }

  return listT

}

app.get("/orders", async (req, res) => {
  try {
    const orders = await Order.find().lean().exec()
    let newOrders = {}
    let newArray = []
    console.log(orders)

    for (const order of orders) {
      let list = handleLoad(order.status)
      newOrders = {
        list,
        order
      }
      newArray.push(newOrders)
    }
    console.log(newArray)
    // console.log(orders)
    if (orders.length === 0) {
      return res.send('No orders in the system')
    }



    res.render('orderProcessing', {
      layout: 'layout',
      newArray
    })
  } catch (error) {
    console.log(error)
  }
})



app.post("/updateOrder/:id", async (req, res) => {
  const newStatus = req.body.status;
  try {

    const orderId = req.params.id

    console.log('newStatus:', newStatus)

    const orderToUpdate = await Order.findOne({ _id: orderId })

    if (orderToUpdate === null) {
      return res.send('Order not found');
    }

    const updatedValues = {
      status: newStatus
    }

    await orderToUpdate.updateOne(updatedValues)
    console.log('Done', orderToUpdate)



    res.redirect('/orders')
  } catch (error) {
    console.log(error);
    res.send('Error updating order');
  }
})


/// -----------------Driver Delivery APIs--------------------------------------

app.post("/login", (req, res) => {

})

app.get("/availableOrders", (req, res) => {

})

app.post("/selectOrder", (req, res) => {

})

app.post("/delivered", (req, res) => {

})

app.listen(HTTP_PORT, onHttpStart);
