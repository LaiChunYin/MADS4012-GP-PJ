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
        console.log("uploading ", req, `${Date.now()}${path.extname(file.originalname)}`)
        cb(null, `deliveryPic_${Date.now()}${path.extname(file.originalname)}`)
    }
})
const upload = multer({storage: myStorage})
console.log("upload is ", upload, `${__dirname}/assets/images/`)
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
//   orders: [String]
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
        console.log("in get menu items")
        const menuItems = await MenuItem.find().lean().exec()
        console.log(menuItems)

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
        // const menuItems = await MenuItem.find().lean().exec()
        const menuItems = await getMenuItems()
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
        const menuItems = await getMenuItems()
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
app.get("/restaurant/showOrders", async (req, res) => {
  try {
    console.log("show order req query ", req.query, req.body, req.params)
    const currentOrdersOnly = req.query.currentOrdersOnly === "false"? false : true
    const sortOrder = req.query.sortOrder === "ascending"? 1 : -1
    const customerName = typeof(req.query.customerName) === "string" && req.query.customerName !== "" ? req.query.customerName : null
    const updatedItem = typeof(req.query.updatedItem) === "string" && req.query.updatedItem !== "" ? req.query.updatedItem : null
    console.log("updatedItem is ", typeof(updatedItem), updatedItem)
    console.log("customer name is ", typeof(customerName), customerName)
    console.log("sort order is ", typeof(sortOrder), sortOrder)
    console.log("current order only is ", typeof(currentOrdersOnly), currentOrdersOnly)

    let searchCriteria = {}
    if(currentOrdersOnly === true){
        // orders = await Order.find({"status": {$ne : "DELIVERED"}}).sort({"orderTime": sortOrder}).lean().exec()
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
        // return res.send('No orders in the system')
        const errMsg = 'No orders in the system'
        return res.render("./orderProcessingTemplates/orderProcessing.hbs", { layout: "orderProcessingLayout", errMsg, currentOrdersOnly})
    }

    console.log("orders", orders)

    // get orders that are not yet delivered
    const ordersToBeDisplayed = []
    for (const data of orders) {currentOrdersOnly
        console.log("data is ", data)
        const currentStatusIndex = Object.values(STATUS).indexOf(data.status)
        const statuses = Object.values(STATUS)
        console.log("statuses 1 ", currentStatusIndex, statuses)
        // move the current status to the first position
        const currentStatus = statuses[currentStatusIndex]
        statuses[currentStatusIndex] = statuses[0]
        statuses[0] = currentStatus
        console.log("statuses 2 ", statuses, data._id.toString())

        const orderInfo = Object.assign(data, {
            numberOfItems: data.items.length,
            statuses,
            isUpdatedMsg: data._id.toString() === updatedItem? "Order Status Updated Successfully" : false,
        })
        ordersToBeDisplayed.push(orderInfo)
    }
    console.log("order to be displayed ", ordersToBeDisplayed)
    // console.log(orders)

    res.render("./orderProcessingTemplates/orderProcessing.hbs", {
      layout: "orderProcessingLayout",
      ordersToBeDisplayed,
      currentOrdersOnly,
    })
  } catch (error) {
    console.log(error)
  }
})


app.post("/restaurant/updateOrder/:id", async (req, res) => {
  const newStatus = req.body.status;
  try {

    const orderId = req.params.id

    console.log('newStatus:', newStatus, orderId)

    const orderToUpdate = await Order.findOne({ _id: orderId })

    if (orderToUpdate === null) {
      return res.send('Order not found');
    }

    const updatedValues = {
      status: newStatus
    }

    await orderToUpdate.updateOne(updatedValues)
    console.log('Done', orderToUpdate)



    res.redirect(`/restaurant/showOrders?updatedItem=${orderId}`)
  } catch (error) {
    console.log(error);
    res.send('Error updating order');
  }
})


/// -----------------Driver Delivery APIs used by the drivers--------------------------------------

app.get("/drivers/login", (req, res) => {
    return res.render("./deliveryTemplates/driverLogin", {layout: "deliveryLayout", hideNavbar: true})       
})

app.post("/drivers/login", async(req,res) =>{
    if(req.body!==undefined)
    {
        console.log("Form fields: "+JSON.stringify(req.body))
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
            console.log(err)
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
        console.log("Form fields: "+JSON.stringify(req.body))
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
                    console.log(err)
                    return res.send(err);
                }
            }
        }
        catch(err) {
            console.log(err)
            return res.send(err);
        }
    }
})

// app.get("/drivers/dashboard", authenticateDriver, (req, res)=>{
//     return res.render("./deliveryTemplates/driverDashboard",{layout: "deliveryLayout", user: req.session.user})
// })

app.get("/drivers/openDeliveries", authenticateDriver, async(req, res) => {
    try
    {
        const ordersToBeDelivered = await Order.find({status: STATUS.READY_FOR_DELIVERY}).lean().exec()
        console.log("ordersToBeDelivered is ", ordersToBeDelivered)
        if(ordersToBeDelivered.length!==0)
            return res.render("./deliveryTemplates/driverOpenDeliveries",{layout: "deliveryLayout", orders: ordersToBeDelivered, user: req.session.user})
        else
            return res.render("./deliveryTemplates/driverOpenDeliveries",{layout: "deliveryLayout", msg: "No orders ready for delivery!", user: req.session.user})
    }
    catch(err) {
        console.log(err)
        return res.send(err);
    }
})

app.post("/drivers/openDeliveries/:id", authenticateDriver, async(req, res) => {
    const id=req.params.id;
    try
    {
        // const result1 = await Order.findOne({_id: id})
        // const updateOrder = await result1.updateOne({status: "IN TRANSIT"})
        // const result2 = await Driver.findOne({username: req.session.user.username})
        // const updateDriver = await result2.updateOne({$push: { orders: id }})
        const orderToTransit = await Order.findOne({_id: id})
        const currentDriver = await Driver.findOne({username: req.session.user.username})
        const updateOrder = await orderToTransit.updateOne({status: "IN TRANSIT", driver: {username: currentDriver.username, licensePlate: currentDriver.licensePlate}})
        console.log("update order is ", updateOrder)
        // const updateDriver = await currentDriver.updateOne({$push: { orders: id }})
        // return res.render("./deliveryTemplates/driverOpenDeliveries",{layout: "deliveryLayout", user: req.session.user})
        res.redirect("/drivers/openDeliveries")
    }
    catch(err) {
        console.log(err)
        return res.send(err);
    }
})

app.get("/drivers/orderFulfillment", authenticateDriver, async(req, res) => {
    try {
        // const currentDriver = await Driver.findOne({username: req.session.user.username}).lean().exec()
        // if(currentDriver.orders.length!==0)
        // {
        //     let orderList=[]
        //     for(order of currentDriver.orders)
        //     {
        //         const result2 = await Order.findOne({_id: order}).lean().exec()
        //         orderList.push(result2)
        //     }
        //     return res.render("./deliveryTemplates/driverOrderFulfillment",{layout: "deliveryLayout", user: req.session.user, orders: orderList})
        // }
        const fulfilledOrders = await Order.find({"driver.username": req.session.user.username}).lean().exec();
        console.log("fulfilled orders ", fulfilledOrders)
        if(fulfilledOrders.length !== 0){
            // return res.render("./deliveryTemplates/driverOrderFulfillment",{layout: "deliveryLayout", user: req.session.user, orders: fulfilledOrders})
            return res.render("./deliveryTemplates/driverOpenDeliveries",{layout: "deliveryLayout", inFulfillment: true, user: req.session.user, orders: fulfilledOrders, msg1: "delete this"})
        }
        else
        {
            // return res.render("./deliveryTemplates/driverOrderFulfillment",{layout: "deliveryLayout", user: req.session.user, msg: "No orders assigned for delivery!"})
            return res.render("./deliveryTemplates/driverOpenDeliveries",{layout: "deliveryLayout", inFulfillment: true, user: req.session.user, msg: "No orders assigned for delivery!"})
        }
    } 
    catch(err) {
        console.log(err)
        return res.send(err);
    }  
})

app.post("/drivers/uploadDeliveryPic/:id", authenticateDriver, upload.single("deliveryPic"), async(req, res)=> {
    const id=req.params.id;
    try
    {
        const orderDelivered = await Order.findOne({_id: id})
        // const updateOrder = await orderDelivered.updateOne({status: STATUS.DELIVERED})
        const updateOrder = await orderDelivered.updateOne({status: STATUS.DELIVERED, photoOfDelivery: `/images/${req.file.filename}`})
        // const result2 = await Driver.findOne({username: req.session.user.username})
        // const updateDriver = await result2.updateOne({$pull: { orders: id }})
        console.log("before testings ", req)
        // res.render("./deliveryTemplates/driverOpenDeliveries", {layout: "deliveryLayout", user: req.session.user})
        // res.render("./deliveryTemplates/driverOrderFulfillment", {layout: "deliveryLayout", user: req.session.user})
        res.redirect("/drivers/orderFulfillment")
    }
    catch(err) {
        console.log(err)
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
