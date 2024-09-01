const express = require("express");
const MQTT = require("mqtt");
const path = require("path");
const cors = require("cors");
const { PrismaClient } = require("@prisma/client");
require("dotenv").config({ path: ".env" });

const app = express();
const PORT = 3000;

const prisma = new PrismaClient();

app.use(express.json());

app.use(cors());

const MQTT_PORT = process.env.MQTT_PORT;
const CONNECTURL = `mqtt://${process.env.MQTT_HOST}:${MQTT_PORT}`;
const ACTION_TOPIC1 = "prc1/action";
const ACTION_TOPIC2 = "prc2/status";
const SUBSCRIBE_TOPIC = "prc1/status";
const INSERT_TOPIC = "prc1/insert";

const client = MQTT.connect(CONNECTURL, {
  clientId: process.env.CLIENT_ID,
  clean: true,
  connectTimeout: 7200,
  username: process.env.MQTT_USER,
  password: process.env.MQTT_PASSWORD,
  reconnectPeriod: 10000,
});

const front_client = MQTT.connect(`ws://broker.mqttdashboard.com:8000`, {
  clientId: "front_end",
  clean: true,
  path: "/mqtt",
  connectTimeout: 7200,
  reconnectPeriod: 10000,
});

client.on("error", function (error) {
  console.log("Can't connect: " + error);
});

client.on("connect", () => {
  console.log(`Connected to MQTT broker ${CONNECTURL}`);
  client.subscribe(SUBSCRIBE_TOPIC, (err) => {
    if (err) {
      console.log("Failed to subscribe:", err);
    } else {
      console.log(`Subscribed to topic '${SUBSCRIBE_TOPIC}'`);
    }
  });
  client.subscribe(INSERT_TOPIC, (err) => {
    if (err) {
      console.log("Failed to subscribe:", err);
    } else {
      console.log(`Subscribed to topic '${INSERT_TOPIC}'`);
    }
  });
});

client.on("message", (topic, message) => {
  if (topic === SUBSCRIBE_TOPIC) {
    console.log(
      `Received message from '${SUBSCRIBE_TOPIC}': ${message.toString()}`
    );
    front_client.publish(ACTION_TOPIC2, message, { qos: 0, retain: false });
    console.log(`Published '${message}' to '${ACTION_TOPIC2}'`);
  }
});

// INSERT TOPIC
client.on("message", async (topic, message) => {
  if (topic === INSERT_TOPIC) {
    const { is_raining, temp } = JSON.parse(message.toString());

    try {
      await prisma.PRC018.updateMany({
        where: {
          id: 1,
        },
        data: {
          temp: temp,
          is_raining: is_raining,
          updated_at: new Date(),
        },
      });
    } catch (err) {
      console.error(err);
    }
  }
});

app.use(express.static(path.join(__dirname, "public")));

app.post("/publish", (req, res) => {
  const { message } = req.body;

  if (message) {
    publishMessage(ACTION_TOPIC1, message, res);
  }
});

function publishMessage(topic, message, res) {
  client.publish(topic, message, { qos: 0, retain: false }, (error) => {
    if (error) {
      console.log("Failed to publish message:", error.message);
      return res.status(500).send("Failed to publish message");
    }
    console.log(`Message '${message}' published to TOPIC '${topic}'`);
    res.status(200).send(`Message '${message}' sent to topic`);
  });
}

app.get("/api/status", async (req, res) => {
  try {
    const data = await prisma.PRC018.findFirst({
      where: {
        id: 1,
      },
      orderBy: {
        timestamp: "asc",
      },
    });

    res.status(200).json(data);
  } catch (err) {
    console.error(err);
  }
});

app.put("/api/update", async (req, res) => {
  const { temp, is_raining } = req.body;

  try {
    const data = await prisma.PRC018.updateMany({
      where: {
        id: 1,
      },
      data: {
        temp: temp,
        is_raining: is_raining,
        updated_at: new Date(),
      },
    });

    res.status(200).json(data);
  } catch (err) {
    console.error(err);
  }
});

app.put("/api/system", async (req, res) => {
  const { system_on } = req.body;

  try {
    const updatedRow = await prisma.PRC018.updateMany({
      where: {
        id: 1,
      },
      data: {
        system_on: system_on,
      },
    });

    res
      .status(200)
      .json({ message: "Power status updated successfully.", updatedRow });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to update power status" });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
