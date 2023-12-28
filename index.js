const express = require("express");
const app = express();
const cors = require("cors");
const jwt = require("jsonwebtoken");
require("dotenv").config();
const port = process.env.PORT || 5000;
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");

app.use(cors());
app.use(express.json());

const verifyJWT = (req, res, next) => {
  const authorization = req.headers.authorization;
  if (!authorization) {
    return res
      .status(401)
      .send({ error: true, message: "unauthorized access" });
  }
  // bearer token
  const token = authorization.split(" ")[1];
  jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
    if (err) {
      return res
        .status(401)
        .send({ error: true, message: "unauthorized access" });
    }
    req.decoded = decoded;
    next();
  });
};
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.tdjlbxg.mongodb.net/?retryWrites=true&w=majority`;
console.log(uri);

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  try {
    // await client.connect();

    const appointmentCollection = client
      .db("dochouse")
      .collection("AppointmentOptions");
    const bookingsCollection = client.db("dochouse").collection("bookings");
    const usersCollection = client.db("dochouse").collection("users");
    const doctorsCollection = client.db("dochouse").collection("doctors");
    const doctorsInfoCollection = client
      .db("dochouse")
      .collection("doctorsInfo");
    const reviewsCollection = client.db("dochouse").collection("reviews");
    const contactsCollection = client.db("dochouse").collection("contacts");

    app.post("/jwt", (req, res) => {
      const user = req.body;
      const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, {
        expiresIn: "8h",
      });
      res.send({ token });
    });
    // warning : use verifyJWT before using verifyAdmin
    const verifyAdmin = async (req, res, next) => {
      const email = req.decoded.email;
      const query = { email: email };
      const user = await usersCollection.findOne(query);
      if (user?.role !== "admin") {
        return res
          .status(403)
          .send({ error: true, message: "forbidden access" });
      }
      next();
    };
    // warning : use verifyJWT before using verifyDoctor
    const verifyDoctor = async (req, res, next) => {
      const email = req.decoded.email;
      const query = { email: email };
      const user = await usersCollection.findOne(query);
      if (user?.role !== "doctor") {
        return res
          .status(403)
          .send({ error: true, message: "forbidden access" });
      }
      next();
    };
    app.get("/appointmentOptions", async (req, res) => {
      const result = await appointmentCollection.find().toArray();
      res.send(result);
    });
    app.post("/services", verifyJWT, verifyAdmin, async (req, res) => {
      try {
        const newService = req.body;

        console.log("Received data:", newService); // Log the received data

        // Wrap newService in an array before inserting
        const result = await appointmentCollection.insertMany([newService]);

        res.status(201).json(result);
      } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Internal Server Error" });
      }
    });

    // booking related api
    app.post("/bookings",verifyJWT, async (req, res) => {
      const newItem = req.body;

      // Check if the slot for the given service is already booked
      const existingBooking = await bookingsCollection.findOne({
        appointmentDate: newItem.appointmentDate,
        slot: newItem.slot,
        treatmentName: newItem.treatmentName,
      });

      if (existingBooking) {
        return res.status(400).send("Slot already booked for this service");
      }

      const result = await bookingsCollection.insertOne(newItem);
      res.send(result);
    });

    app.get("/bookings", verifyJWT, async (req, res) => {
      const email = req.query.email;
      if (!email) {
        res.send([]);
      }
      const decodedEmail = req.decoded.email;
      if (email !== decodedEmail) {
        return res
          .status(403)
          .send({ error: true, message: "forbidden access" });
      }
      const query = { email: email };
      const result = await bookingsCollection.find(query).toArray();
      res.send(result);
    });

    app.delete("/bookings/:id", verifyJWT, async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await bookingsCollection.deleteOne(query);
      res.send(result);
    });

    // user related api
    app.get("/users", verifyJWT, verifyAdmin, async (req, res) => {
      const result = await usersCollection.find().toArray();
      res.send(result);
    });

    app.post("/users", async (req, res) => {
      const user = req.body;
      console.log(user);
      const query = { email: user.email };
      const existingUser = await usersCollection.findOne(query);
      console.log("existingUser", existingUser);
      if (existingUser) {
        return res.send({ message: "user already exists" });
      }
      const result = await usersCollection.insertOne(user);
      res.send(result);
    });

    app.get("/users/admin/:email", verifyJWT, async (req, res) => {
      const email = req.params.email;
      if (req.decoded.email !== email) {
        res.send({ admin: false });
      }
      const query = { email: email };
      const user = await usersCollection.findOne(query);
      const result = { admin: user?.role === "admin" };
      res.send(result);
    });

    app.patch("/users/admin/:id", verifyJWT, verifyAdmin, async (req, res) => {
      const id = req.params.id;
      const filter = { _id: new ObjectId(id) };
      const updatedDoc = {
        $set: {
          role: "admin",
        },
      };
      const result = await usersCollection.updateOne(filter, updatedDoc);
      res.send(result);
    });

    app.delete("/users/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await usersCollection.deleteOne(query);
      res.send(result);
    });

    // see all booked appointment as an admin
    app.get(
      "/bookingAppointments",
      verifyJWT,
      verifyAdmin,
      async (req, res) => {
        const result = await bookingsCollection.find().toArray();
        res.send(result);
      }
    );

    // add a doctor
    app.get(
      "/appointmentSpeciality",
      verifyJWT,
      verifyDoctor,
      async (req, res) => {
        const query = {};
        const result = await appointmentCollection
          .find(query)
          .project({ service_name: 1 })
          .toArray();
        res.send(result);
      }
    );

    // reviews
    app.post("/reviews", verifyJWT, async (req, res) => {
      const newItem = req.body;
      const result = await reviewsCollection.insertOne(newItem);
      res.send(result);
    });

    app.get("/reviews", async (req, res) => {
      const result = await reviewsCollection.find().toArray();
      res.send(result);
    });

    // individual user reviews
    app.get("/users/email/:email", verifyJWT, async (req, res) => {
      const emailParam = req.params.email;
      console.log("Email parameter:", emailParam); // Add this line for logging

      // Filter users by email
      const result = await reviewsCollection.findOne({ email: emailParam });
      res.send(result);
    });

    app.get(
      "/users/admin/email/:email",
      verifyJWT,
      verifyAdmin,
      async (req, res) => {
        const emailParam = req.params.email;
        console.log("Email parameter:", emailParam); // Add this line for logging

        try {
          const query = { email: emailParam };
          const user = await usersCollection.findOne(query);

          if (user && user.role === "admin") {
            res.send({ isAdmin: true });
          } else {
            res.send({ isAdmin: false });
          }
        } catch (error) {
          console.error("Error checking admin role:", error);
          res
            .status(500)
            .send({ error: true, message: "Internal Server Error" });
        }
      }
    );

    // Add this route to your server code
    app.get(
      "/users/check-email/:email",
      verifyJWT,
      verifyAdmin,
      async (req, res) => {
        const emailParam = req.params.email;
        console.log("Checking email availability:", emailParam);

        try {
          const query = { email: emailParam };
          const user = await usersCollection.findOne(query);

          if (user) {
            res.send({ emailExists: true });
          } else {
            res.send({ emailExists: false });
          }
        } catch (error) {
          console.error("Error checking email:", error);
          res
            .status(500)
            .send({ error: true, message: "Internal Server Error" });
        }
      }
    );
    app.patch(
      "/users/doctor/:email",
      verifyJWT,
      verifyAdmin,
      async (req, res) => {
        const emailParam = req.params.email;
        console.log(
          "Request to make user a doctor. Target User Email:",
          emailParam
        );

        try {
          const filter = { email: emailParam };
          const updatedDoc = {
            $set: {
              role: "doctor",
            },
          };

          const result = await usersCollection.updateOne(filter, updatedDoc);

          console.log("Update result:", result);

          if (result.matchedCount > 0 && result.modifiedCount > 0) {
            console.log("User has been made a doctor.");
            res.send({ message: "User has been made a doctor." });
          } else {
            console.log("User not found or not modified.");
            res.status(404).send({
              error: true,
              message: "User not found or not modified.",
            });
          }
        } catch (error) {
          console.error("Error making user a doctor:", error);
          res
            .status(500)
            .send({ error: true, message: "Internal Server Error" });
        }
      }
    );
    app.get("/users/doctor/:email", verifyJWT, async (req, res) => {
      const email = req.params.email;
      if (req.decoded.email !== email) {
        res.send({ doctor: false });
      }
      const query = { email: email };
      const user = await usersCollection.findOne(query);
      const result = { doctor: user?.role === "doctor" };
      res.send(result);
    });

    app.post("/addDoctorInfo", verifyJWT, verifyDoctor, async (req, res) => {
      const newDoctor = req.body;
      const result = await doctorsInfoCollection.insertOne(newDoctor);
      res.send(result);
    });
    app.get("/doctorsInfo", async (req, res) => {
      const result = await doctorsInfoCollection.find().toArray();
      res.send(result);
    });
    // Add this logic when handling doctor deletion in your server code
    app.delete("/doctors/:id", verifyJWT, verifyAdmin, async (req, res) => {
      const id = req.params.id;
      console.log(id);
      const query = { _id: new ObjectId(id) };

      // Find the doctor to get the associated email
      const doctor = await doctorsInfoCollection.findOne(query);

      // Delete the doctor from doctorsInfoCollection
      const resultDoctor = await doctorsInfoCollection.deleteOne(query);

      // Delete the corresponding user from usersCollection
      const resultUser = await usersCollection.deleteOne({
        email: doctor.email,
      });

      res.send({ resultDoctor, resultUser });
    });

    app.put("/doctors/:id", verifyJWT, verifyDoctor, async (req, res) => {
      const id = req.params.id;
      const filter = { _id: new ObjectId(id) };
      const updatedData = req.body; // Get the updated data from the request body
      const result = await doctorsInfoCollection.updateOne(filter, {
        $set: updatedData,
      });
      console.log(result);

      // Check if the update was successful and send a response accordingly
      if (result.matchedCount > 0 && result.modifiedCount > 0) {
        // The update was successful
        res.status(200).json({ message: "Doctor Info updated successfully" });
      } else {
        // No matching document found or no changes made
        res.status(400).json({ message: "No Doctor Info updated" });
      }
    });

    app.put(
      "/appointmentOptions/:id",
      verifyJWT,
      verifyAdmin,
      async (req, res) => {
        const id = req.params.id;
        const filter = { _id: new ObjectId(id) };
        const updatedData = req.body; // Get the updated data from the request body
        const result = await appointmentCollection.updateOne(filter, {
          $set: updatedData,
        });
        console.log(result);

        // Check if the update was successful and send a response accordingly
        if (result.matchedCount > 0 && result.modifiedCount > 0) {
          // The update was successful
          res
            .status(200)
            .json({ message: "appointment Options updated successfully" });
        } else {
          // No matching document found or no changes made
          res
            .status(400)
            .json({ message: "No appointmentOptions Info updated" });
        }
      }
    );

    // individual doctor info
    app.get("/doctors/:email", verifyJWT, verifyDoctor, async (req, res) => {
      const emailParam = req.params.email;
      console.log("Email parameter:", emailParam); // Add this line for logging

      // Filter users by email
      const result = await doctorsInfoCollection.findOne({ email: emailParam });
      res.send(result);
    });

    // contacts related api

    app.post("/contacts", async (req, res) => {
      const newItem = req.body;
      const result = await contactsCollection.insertOne(newItem);
      res.send(result);
    });
  } finally {
  }
}
run().catch(console.dir);

app.get("/", (req, res) => {
  res.send("dochouse server side is running");
});
app.listen(port, () => {
  console.log(`dochouse website server side running on port ${port}`);
});
