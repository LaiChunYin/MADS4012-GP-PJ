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

// Constants
const dbName = "MADS4012-Project"
const password = "3ltAmn86F98usTkk"
const CONNECTION_STRING = `mongodb+srv://101470580:${password}@cluster0.vawi6nl.mongodb.net/${dbName}?retryWrites=true&w=majority`;
const STATUS = {
    RECEIVED: "RECEIVED",
    READY_FOR_DELIVERY: "READY FOR DELIVERY",
    IN_TRANSIT: "IN TRANSIT",
    DELIVERED: "DELIVERED",
}

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
  items: [{name: String, price: Number}],
  orderTime: Date,
  status: String,
  subtotal: Number,
  tax: Number,
  grandTotal: Number,
  orderConfirmationNumber: Number,
});

const Driver = mongoose.model("driver_collection", driverSchema);
const MenuItem = mongoose.model("menu_item_collection", menuItemSchema);
const Order = mongoose.model("order_collection", orderSchema);


const onHttpStart = () => {
  console.log(`Express web server running on port: ${HTTP_PORT}`);
  console.log(`Press CTRL+C to exit`);
};


// -----------------helper functions---------------------------------------------------------
const getMenuItems = async (treatEmptyAsError) => {
    try {
        console.log("in get menu items")
        const menuItems = await MenuItem.find().lean().exec()
        console.log(menuItems)

        // error handling
        if (treatEmptyAsError && menuItems.length === 0) {
            return "ERROR: No menu items in the database"
        }

        return menuItems
       
        
    } catch (err) {
        console.log(err)        
    } 
}

const calculatePrices = async (items) => {
    try {
        console.log("in calprice ", items)

        let subtotal = 0
        for(dish of items){
            subtotal += Number(dish.price)
        }
        const tax = Number((subtotal * 0.13).toFixed(2))
        const grandTotal = Number((subtotal + tax).toFixed(2))
        console.log("tax, totals ", tax, subtotal, grandTotal)

        return {subtotal, tax, grandTotal}

    } catch (err) {
        console.log(`Error when calculating prices: ${err}`)
    } 
}

const generateOrderConfirmatinoNumber = async () => {
    try {
        const result = await Order.findOne().sort({"orderConfirmationNumber": -1}).lean().exec()
        console.log("gen result ", result)
        const currentMaxConfirmationNumber = result !== null? result.orderConfirmationNumber : 0
        console.log("current max ", currentMaxConfirmationNumber)

        const confimationNumber = currentMaxConfirmationNumber + 1
        return confimationNumber
    }
    catch(err){
        console.log(`Error when generating order confirmation number: ${err}`)
    }
}

/// -----------------Restaurant APIs used by the customers--------------------------------------
app.get("/", (req, res) => {
    res.redirect("/customers/menuItems");
});

app.get("/customers/menuItems", async (req, res) => {
    try {
        // const menuItems = await MenuItem.find().lean().exec()
        const menuItems = await getMenuItems(true)
        console.log("in /customers/menuItems ", menuItems)

        return res.render("./restaurantTemplates/menu.hbs", {layout: "restaurantLayout", menuItems: menuItems})       
        
    } catch (err) {
        console.log(`ERROR in GET /customers/menuItems: ${err}`)
        return res.send("ERROR: Cannot get menu Items")  
    }  
})

app.get("/customers/orderForm", async (req, res) => {
    try {
        const errMsg = req.query.errMsg
        console.log("in /customers/orderForm", errMsg)

        // const menuItems = await MenuItem.find().lean().exec()
        const menuItems = await getMenuItems(true)
        console.log("in /customers/orderForm, menuItems ", menuItems)

        // return res.send("done")
        return res.render("./restaurantTemplates/orderForm.hbs", {layout: "restaurantLayout", errMsg, menuItems: menuItems}) 
        
    } catch (err) {
        console.log(`ERROR in GET /customers/orderForm: ${err}`)
        return res.send("ERROR: Cannot show order form")    
    }  
})

app.post("/customers/order", async (req, res) => {
    try {
        const customerName = req.body.customerName
        const deliveryAddress = req.body.deliveryAddress
        delete req.body.customerName
        delete req.body.deliveryAddress

        // the remaining fields in the body are the items to be ordered
        const itemsToOrder = []
        for(items of Object.keys(req.body)){
            itemsToOrder.push({
                name: items,
                price: Number(req.body[items]),
            })
        }

        if(itemsToOrder.length === 0){
            return res.redirect("/customers/orderForm?errMsg=No items is selected!")
        }
        else if(customerName === ""){
            return res.redirect("/customers/orderForm?errMsg=Please enter your name!")
        }
        else if(deliveryAddress === ""){
            return res.redirect("/customers/orderForm?errMsg=Please enter the delivery Address!")
        }
        else{
            console.log("items ", itemsToOrder)

            const prices = await calculatePrices(itemsToOrder)
            const confirmationNumber = await generateOrderConfirmatinoNumber()

            const newOrder = {
                customerName: customerName,
                deliveryAddress: deliveryAddress,
                items: itemsToOrder,
                orderTime: Date.now(),
                status: STATUS.RECEIVED,

                subtotal: prices.subtotal,
                tax: prices.tax,
                grandTotal: prices.grandTotal,

                orderConfirmationNumber: confirmationNumber,
            }

            const orderToBeSaved = new Order(newOrder)
            const savedOrder = await orderToBeSaved.save()
            console.log("order saved ", savedOrder)

            return res.render("./restaurantTemplates/orderReceipt.hbs", {layout: "restaurantLayout", newOrder}) 
        }
        
    } catch (err) {
        console.log(`ERROR in POST /customers/order: ${err}`)
        return res.send("ERROR: Cannot create new order in the database")
    }  

})

app.get("/customers/orderStatus", async (req, res) => {
    try{
        const orderId = Number(req.query.orderId)
        if(Number.isNaN(orderId)){
            return res.render("./restaurantTemplates/orderStatusForm.hbs", {layout: "restaurantLayout"})
        }

        console.log("order id is ", orderId)

        const order = await Order.find({orderConfirmationNumber: orderId}).lean().exec()
        console.log("in order status, ", order)

        let errMsg = ""
        if(typeof(orderId) === "number" && order.length === 0) {
            console.log("no order found")
            errMsg = "No order is found"
        }

        console.log("err message ", errMsg)
        res.render("./restaurantTemplates/orderStatusForm.hbs", {layout: "restaurantLayout", order, errMsg}) 
    }
    catch(err){
        console.log(`ERROR in GET /customers/orderStatus: ${err}`)
        return res.send("ERROR: Cannot get order status")
    }
})

/// -----------------Order Processing APIs used by the restaurant--------------------------------------

app.get("/restaurant/check-order-status", (req, res) => {

})

app.post("/restaurant/place-order", (req, res) => {

})

app.post("/restaurant/show-receipt", (req, res) => {

})



/// -----------------Driver Delivery APIs used by the drivers--------------------------------------

app.post("/drivers/login", (req, res) => {

})

app.get("/drivers/availableOrders", (req, res) => {
    
})

app.post("/drivers/selectOrder", (req, res) => {
    
})

app.post("/drivers/delivered", (req, res) => {
    
})

app.listen(HTTP_PORT, onHttpStart);
