const express = require("express");
const app = express();
const HTTP_PORT = process.env.PORT || 8080;
const path = require("path");

// using handlebars
const exphbs = require('express-handlebars');
app.engine('.hbs', exphbs.engine({ extname: '.hbs' }));
app.set('view engine', '.hbs');

//using multer
const multer = require('multer')
const myStorage = multer.diskStorage({
    destination: "assets/images/",
    filename: function(req, file, cb){
        cb(null, `deliveryPic_${Date.now()}${path.extname(file.originalname)}`)
    }
})
const upload = multer({storage: myStorage})
//using sessions
const session = require('express-session');
app.use(session({
    secret: 'keyboard cat',
    resave: false,
    saveUninitialized: true
}))  

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
  driver: {
    username: String,
    fullName: String,
    licensePlate: String,
  },
  photoOfDelivery: String,
});

const Driver = mongoose.model("driver_collection", driverSchema);
const MenuItem = mongoose.model("menu_item_collection", menuItemSchema);
const Order = mongoose.model("order_collection", orderSchema);


const onHttpStart = () => {
  console.log(`Express web server running on port: ${HTTP_PORT}`);
  console.log(`Press CTRL+C to exit`);
};


// -----------------helper functions---------------------------------------------------------
const getMenuItems = async () => {
    try {
        const menuItems = await MenuItem.find().lean().exec()

        // error handling
        if (menuItems.length === 0) {
            console.log("ERROR: No menu items in the database")
        }

        return menuItems
       
        
    } catch (err) {
        console.log(err)        
    } 
}

const calculatePrices = async (items) => {
    try {
        let subtotal = 0
        for(dish of items){
            subtotal += Number(dish.price)
        }
        const tax = Number((subtotal * 0.13).toFixed(2))
        const grandTotal = Number((subtotal + tax).toFixed(2))

        return {subtotal, tax, grandTotal}

    } catch (err) {
        console.log(`Error when calculating prices: ${err}`)
    } 
}

const generateOrderConfirmatinoNumber = async () => {
    try {
        const result = await Order.findOne().sort({"orderConfirmationNumber": -1}).lean().exec()
        const currentMaxConfirmationNumber = result !== null? result.orderConfirmationNumber : 0

        const confimationNumber = currentMaxConfirmationNumber + 1
        return confimationNumber
    }
    catch(err){
        console.log(`Error when generating order confirmation number: ${err}`)
    }
}

const authenticateDriver = (req, res, next) => {
    if(req.session.isLoggedIn !== undefined && req.session.isLoggedIn){
        next()
    }
    else{
        return res.render("./deliveryTemplates/driverLogin", {layout: "deliveryLayout", hideNavbar: true, msg: "Please login to the application first"})
    }
}

/// -----------------Restaurant APIs used by the customers--------------------------------------
app.get("/", (req, res) => {
    res.redirect("/customers/menuItems");
});

app.get("/customers/menuItems", async (req, res) => {
    try {
        const menuItems = await getMenuItems()
        return res.render("./restaurantTemplates/menu.hbs", {layout: "restaurantLayout", menuItems: menuItems})       
    } catch (err) {
        console.log(`ERROR in GET /customers/menuItems: ${err}`)
        return res.send(err)  
    }  
})

app.get("/customers/orderForm", async (req, res) => {
    try {
        const errMsg = req.query.errMsg
        const menuItems = await getMenuItems()

        return res.render("./restaurantTemplates/orderForm.hbs", {layout: "restaurantLayout", errMsg, menuItems: menuItems}) 
        
    } catch (err) {
        console.log(`ERROR in GET /customers/orderForm: ${err}`)
        return res.send(err)    
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
            await orderToBeSaved.save()

            return res.render("./restaurantTemplates/orderReceipt.hbs", {layout: "restaurantLayout", newOrder}) 
        }
        
    } catch (err) {
        console.log(`ERROR in POST /customers/order: ${err}`)
        return res.send(err)
    }  

})

app.get("/customers/orderStatus", async (req, res) => {
    try{
        const orderId = Number(req.query.orderId)
        if(Number.isNaN(orderId)){
            return res.render("./restaurantTemplates/orderStatusForm.hbs", {layout: "restaurantLayout"})
        }

        const order = await Order.find({orderConfirmationNumber: orderId}).lean().exec()

        let errMsg = ""
        if(typeof(orderId) === "number" && order.length === 0) {
            errMsg = "No order is found"
        }

        res.render("./restaurantTemplates/orderStatusForm.hbs", {layout: "restaurantLayout", order, errMsg}) 
    }
    catch(err){
        console.log(`ERROR in GET /customers/orderStatus: ${err}`)
        return res.send(err)
    }
})

/// -----------------Order Processing APIs used by the restaurant--------------------------------------
app.get("/restaurant/showOrders", async (req, res) => {
  try {
    const currentOrdersOnly = req.query.currentOrdersOnly === "false"? false : true
    const sortOrder = req.query.sortOrder === "ascending"? 1 : -1
    const customerName = typeof(req.query.customerName) === "string" && req.query.customerName !== "" ? req.query.customerName : null
    const updatedItem = typeof(req.query.updatedItem) === "string" && req.query.updatedItem !== "" ? req.query.updatedItem : null

    const searchCriteria = {}
    if(currentOrdersOnly === true){
        searchCriteria["status"] = {$ne : "DELIVERED"}
    }
    if(customerName !== null){
        searchCriteria["customerName"] = customerName
    }
    const orders = await Order.find(searchCriteria).sort({"orderTime": sortOrder}).lean().exec()

    if(orders.length === 0 && customerName !== null) {
        return res.render("./orderProcessingTemplates/orderProcessing.hbs", { layout: "orderProcessingLayout", customerName, currentOrdersOnly})
    }
    else if(orders.length === 0) {
        const errMsg = 'No orders in the system'
        return res.render("./orderProcessingTemplates/orderProcessing.hbs", { layout: "orderProcessingLayout", errMsg, currentOrdersOnly})
    }

    // get orders that are not yet delivered
    const ordersToBeDisplayed = []
    for (const data of orders) {
        const currentStatusIndex = Object.values(STATUS).indexOf(data.status)
        const statuses = Object.values(STATUS)
        // move the current status to the first position
        const currentStatus = statuses[currentStatusIndex]
        statuses[currentStatusIndex] = statuses[0]
        statuses[0] = currentStatus
        
        let orderTotal = 0
        for(let item of data.items){
            orderTotal += item.price
        }
        orderTotal *= 1.13  // tax

        const orderInfo = Object.assign(data, {
            numberOfItems: data.items.length,
            statuses,
            isUpdatedMsg: data._id.toString() === updatedItem? "Order Status Updated Successfully" : false,
            orderTotal,
        })
        ordersToBeDisplayed.push(orderInfo)
    }

    res.render("./orderProcessingTemplates/orderProcessing.hbs", {
      layout: "orderProcessingLayout",
      ordersToBeDisplayed,
      currentOrdersOnly,
    })
  } catch (error) {
    console.log(`ERROR in GET /restaurant/showOrders: ${err}`)
    res.send(error)
  }
})


app.post("/restaurant/updateOrder/:id", async (req, res) => {
    try {
        const newStatus = req.body.status;
        const currentOrdersOnly = req.body.currentOrdersOnly === "false"? false : true; 
        const orderId = req.params.id
        const orderToUpdate = await Order.findOne({ _id: orderId })
        if (orderToUpdate === null) {
        return res.send('Order not found');
        }

        const updatedValues = {
        status: newStatus
        }

        await orderToUpdate.updateOne(updatedValues)

        if(currentOrdersOnly === false){
            res.redirect(`/restaurant/showOrders?updatedItem=${orderId}&currentOrdersOnly=false`)
        }
        else{
            res.redirect(`/restaurant/showOrders?updatedItem=${orderId}`)
        }
  } catch (error) {
    console.log(`ERROR in POST /restaurant/updateOrder/:id: ${error}`);
    res.send(error);
  }
})


/// -----------------Driver Delivery APIs used by the drivers--------------------------------------

app.get("/drivers/login", (req, res) => {
    return res.render("./deliveryTemplates/driverLogin", {layout: "deliveryLayout", hideNavbar: true})       
})

app.post("/drivers/login", async(req,res) =>{
    if(req.body!==undefined)
    {
        const username=req.body.username;
        const password=req.body.password;
        try
        {
            const result = await Driver.findOne({username: username}).lean().exec()
            if(result!==null)
            {
                if(result.password===password)
                {
                    req.session.user = {
                        username : result.username,
                        fullname : result.fullName
                    }
                    req.session.isLoggedIn = true
                    return res.redirect("/drivers/openDeliveries")
                }
                else
                    return res.render("./deliveryTemplates/driverLogin", {layout: "deliveryLayout", hideNavbar: true, msg: "Incorrect password. Please try again."})
            }
            else
            {
                return res.render("./deliveryTemplates/driverLogin", {layout: "deliveryLayout", hideNavbar: true, msg: "User not found. Make sure to register if you haven't already!"})
            }
        }
        catch(err) {
            console.log(`ERROR in POST /drivers/login: ${err}`)
            return res.send(err);
        }
    }
})

app.get("/drivers/register", (req, res) => {
    return res.render("./deliveryTemplates/driverRegister", {layout: "deliveryLayout", hideNavbar: true})       
})

app.post("/drivers/register", async(req, res) => {
    if(req.body!==undefined)
    {
        const fullName=req.body.firstName+" "+req.body.lastName;
        const username=req.body.username;
        const password=req.body.password;
        const vehicleModel=req.body.vehicleModel;
        const color=req.body.vehicleColor;
        const licensePlate=req.body.licensePlate;
        const newDriver = {
            fullName: fullName,
            username: username,
            password: password,
            vehicleModel: vehicleModel,
            color: color,
            licensePlate: licensePlate
        }
        try
        {
            const result = await Driver.findOne({username: username}).lean().exec()
            if(result!==null)
            {
                return res.render("./deliveryTemplates/driverRegister", {layout: "deliveryLayout", hideNavbar: true, msg: "Username already taken, try another"})
            }
            else
            {
                const driverToInsert = new Driver(newDriver)
                try {
                    await driverToInsert.save()
                    return res.render("./deliveryTemplates/driverLogin", {layout: "deliveryLayout", hideNavbar: true, msg: "Registered successfully. Please login to continue"})       
                }
                catch (err) {
                    return res.send(err);
                }
            }
        }
        catch(err) {
            console.log(`ERROR in POST /drivers/register: ${err}`)
            return res.send(err);
        }
    }
})

app.get("/drivers/openDeliveries", authenticateDriver, async(req, res) => {
    try
    {
        const ordersToBeDelivered = await Order.find({status: STATUS.READY_FOR_DELIVERY}).lean().exec()
        if(ordersToBeDelivered.length!==0)
            return res.render("./deliveryTemplates/driverOpenDeliveries",{layout: "deliveryLayout", orders: ordersToBeDelivered, user: req.session.user})
        else
            return res.render("./deliveryTemplates/driverOpenDeliveries",{layout: "deliveryLayout", msg: "No orders ready for delivery!", user: req.session.user})
    }
    catch(err) {
        console.log(`ERROR in GET /drivers/openDeliveries: ${err}`)
        return res.send(err);
    }
})

app.post("/drivers/openDeliveries/:id", authenticateDriver, async(req, res) => {
    const id=req.params.id;
    try
    {
        const orderToTransit = await Order.findOne({_id: id})
        const currentDriver = await Driver.findOne({username: req.session.user.username})
        await orderToTransit.updateOne({status: "IN TRANSIT", driver: {username: currentDriver.username, fullName: currentDriver.fullName, licensePlate: currentDriver.licensePlate}})
        res.redirect("/drivers/openDeliveries")
    }
    catch(err) {
        console.log(`ERROR in POST /drivers/openDeliveries/:id: ${err}`)
        return res.send(err);
    }
})

app.get("/drivers/orderFulfillment", authenticateDriver, async(req, res) => {
    try {
        const fulfilledOrders = await Order.find({"driver.username": req.session.user.username}).lean().exec();
        if(fulfilledOrders.length !== 0){
            return res.render("./deliveryTemplates/driverOpenDeliveries",{layout: "deliveryLayout", inFulfillment: true, user: req.session.user, orders: fulfilledOrders})
        }
        else
        {
            return res.render("./deliveryTemplates/driverOpenDeliveries",{layout: "deliveryLayout", inFulfillment: true, user: req.session.user, msg: "No orders assigned for delivery!"})
        }
    } 
    catch(err) {
        console.log(`ERROR in GET /drivers/orderFulfillment: ${err}`)
        return res.send(err);
    }  
})

app.post("/drivers/uploadDeliveryPic/:id", authenticateDriver, upload.single("deliveryPic"), async(req, res)=> {
    const id=req.params.id;
    try
    {
        const orderDelivered = await Order.findOne({_id: id})
        await orderDelivered.updateOne({status: STATUS.DELIVERED, photoOfDelivery: `/images/${req.file.filename}`})
        res.redirect("/drivers/orderFulfillment")
    }
    catch(err) {
        console.log(`ERROR in POST /drivers/uploadDeliveryPic/:id: ${err}`)
        return res.send(err);
    }
})

app.get("/drivers/driverLogout", (req, res) => {
    req.session.destroy()
    return res.render("./deliveryTemplates/driverLogin", {layout: "deliveryLayout", hideNavbar: true, msg: "Logged out successfully."})
})

// default endpoints
app.use("/customers/*", (req, res) => {
    res.redirect("/customers/menuItems")
})
app.use("/restaurant/*", (req, res) => {
    res.redirect("/restaurant/showOrders")
})
app.use("/drivers/*", (req, res) => {
    res.redirect("/drivers/login")
})

app.listen(HTTP_PORT, onHttpStart);
