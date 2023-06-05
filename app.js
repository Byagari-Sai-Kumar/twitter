const express = require("express");
const path = require("path");
const { open } = require("sqlite");
const sqlite3 = require("sqlite3");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

const dbPath = path.join(__dirname, "twitterClone.db");

const app = express();
app.use(express.json());

let db = null;

const initializeDbAndServer = async () => {
  try {
    db = await open({
      filename: dbPath,
      driver: sqlite3.Database,
    });
    app.listen(4000, () => {
      console.log("Server Running at http://localhost:4000/");
    });
  } catch (error) {
    console.log(error.message);
    process.exit(1);
  }
};

initializeDbAndServer();

//Getting user following peoples Id
const getFollowingPeopleIdsOfUser = async (username) => {
  const getTheFollowingPeopleQuery = `
    SELECT
    following_user_id
    FROM
    follower INNER JOIN user
    ON user.user_id = follower.follower_user_id
    WHERE
    user.username = '${username}';`;

  const followingPeople = await db.all(getTheFollowingPeopleQuery);

  const arrayOfIds = followingPeople.map(
    (eachUser) => eachUser.following_user_id
  );

  return arrayOfIds;
};

//Getting user followers peoples Id
const getFollowerPeopleIdsOfUser = async (username) => {
  const getTheFollowerPeopleQuery = `
    SELECT
    follower_user_id
    FROM
    follower INNER JOIN user
    ON user.user_id = follower.following_user_id
    WHERE
    user.username = '${username}';`;

  const followerPeople = await db.all(getTheFollowerPeopleQuery);

  const arrayOfIds = followerPeople.map(
    (eachUser) => eachUser.follower_user_id
  );

  return arrayOfIds;
};

//Authentication of a user
const authentication = async (request, response, next) => {
  const { tweet } = request.body;
  const { tweetId } = request.params;
  let jwtToken;

  const authHeaders = await request.headers["authorization"];

  if (authHeaders !== undefined) {
    jwtToken = authHeaders.split(" ")[1];
  }
  if (jwtToken === undefined) {
    response.status(401);
    response.send("Invalid JWT Token");
  } else {
    jwt.verify(jwtToken, "mySecretToken", async (error, payload) => {
      if (error) {
        response.status(401);
        response.send("Invalid JWT Token");
      } else {
        request.payload = payload;
        request.tweetId = tweetId;
        request.tweet = tweet;
        next();
      }
    });
  }
};

//tweet access verification
const tweetAccessVerification = async (request, response, next) => {
  const { userId } = request;
  const { tweetId } = request;
  const getTweetQuery = `
    SELECT
    *
    FROM
    tweet INNER JOIN follower
    ON tweet.tweet_id = follower.following_user_id
    WHERE
    tweet.tweet_id = '${tweetId}' AND follower_user_id = '${userId}';`;

  const tweet = await db.get(getTweetQuery);

  if (tweet === undefined) {
    response.status(402);
    response.send("Invalid Request");
  } else {
    next();
  }
};

//User register API1
app.post("/register/", async (request, response) => {
  const { username, password, name, gender } = request.body;

  const getUserDetailsQuery = `
    SELECT
    *
    FROM
    user
    WHERE
    username = '${username}';`;

  const dbUser = await db.get(getUserDetailsQuery);

  if (dbUser === undefined) {
    //checking password length
    if (password.length < 6) {
      response.status(400);
      response.send("Password is too short");
    } else {
      //register user
      const hashedPassword = await bcrypt.hash(password, 10);

      const registerUserQuery = `
        INSERT INTO user
        (name,username,password,gender)
        VALUES(
            '${name}',
            '${username}',
            '${hashedPassword}',
            '${gender}'
            );`;

      const newUser = db.run(registerUserQuery);

      response.send("User created successfully");
    }
  } else {
    response.status(400);
    response.send("User already exists");
  }
});

//User Login API2
app.post("/login/", async (request, response) => {
  const { username, password } = request.body;

  const getUserQuery = `
    SELECT
    *
    FROM
    user
    WHERE
    username = '${username}';`;

  const userDbDetails = await db.get(getUserQuery);

  if (userDbDetails === undefined) {
    response.status(400);
    response.send("Invalid user");
  } else {
    //checking password
    const isPasswordCorrect = await bcrypt.compare(
      password,
      userDbDetails.password
    );

    if (isPasswordCorrect === true) {
      const jwtToken = jwt.sign(userDbDetails, "mySecretToken");

      response.send({ jwtToken: jwtToken });
    } else {
      response.status(400);
      response.send("Invalid password");
    }
  }
});

//get Tweets API3
app.get("/user/tweets/feed/", authentication, async (request, response) => {
  const { payload } = request;
  const { user_id, name, username, gender } = payload;

  const getTweetsFeedQuery = `
    SELECT
    username,
    tweet,
    date_time AS dateTime
    FROM
    follower INNER JOIN tweet 
    ON follower.following_user_id = tweet.user_id
    INNER JOIN user ON user.user_id = follower.following_user_id
    WHERE
    follower.follower_user_id = ${user_id}
    ORDER BY 
    date_time DESC
    LIMIT 4;`;

  const tweetFeedArray = await db.all(getTweetsFeedQuery);

  response.send(tweetFeedArray);
});

//get following users API4
app.get("/user/following/", authentication, async (request, response) => {
  const { payload } = request;
  const { user_id, name, username, gender } = payload;

  const getFollowingUsersQuery = `
   SELECT
   name
   FROM 
   user INNER JOIN follower ON user.user_id = follower.following_user_id
   WHERE
    follower.follower_user_id = ${user_id};`;

  const followingUsers = await db.all(getFollowingUsersQuery);

  response.send(followingUsers);
});

//get followers users API5
app.get("/user/followers/", authentication, async (request, response) => {
  const { payload } = request;
  const { user_id, name, username, gender } = payload;

  const getFollowerUsersQuery = `
   SELECT
   name
   FROM 
   user INNER JOIN follower
   ON user.user_id = follower.follower_user_id 
   WHERE
   follower.following_user_id = ${user_id};`;

  const followerUsers = await db.all(getFollowerUsersQuery);

  response.send(followerUsers);
});

//get tweets of followers API6
app.get("/tweets/:tweetId/", authentication, async (request, response) => {
  const { tweetId } = request;
  const { payload } = request;
  const { user_id, name, username, gender } = payload;

  const tweetsQuery = `
    SELECT
    *
    FROM
    tweet
    WHERE
    tweet_id = ${tweetId};`;

  const tweetsResult = await db.get(tweetsQuery);

  const userFollowersQuery = `
    SELECT
    *
    FROM
    user INNER JOIN follower
    ON user.user_id = follower.following_user_id
    WHERE
    follower.follower_user_id = ${user_id};`;

  const userFollowers = await db.all(userFollowersQuery);

  if (
    userFollowers.some(
      (item) => item.following_user_id === tweetsResult.user_id
    )
  ) {
    const getTweetDetailQuery = `
        SELECT
        tweet,
        COUNT (DISTINCT(like.like_id)) AS likes,
        COUNT (DISTINCT(reply.reply_id)) AS replies,
        tweet.date_time AS dateTime
        FROM
        tweet INNER JOIN like ON tweet.tweet_id = like.tweet_id
        INNER JOIN reply ON reply.tweet_id = tweet.tweet_id
        WHERE
        tweet.tweet_id = ${tweetId} AND tweet.user_id = ${userFollowers[0].user_id};`;

    const tweetDetails = await db.get(getTweetDetailQuery);
    response.send(tweetDetails);
  } else {
    response.status(401);
    response.send("Invalid Request");
  }
});

//API7
app.get(
  "/tweets/:tweetId/likes/",
  authentication,
  async (request, response) => {
    const { tweetId } = request;
    const { payload } = request;
    const { user_id, name, username, gender } = payload;

    const getLikedUserQuery = `
    SELECT
    username
    FROM
    follower INNER JOIN tweet ON tweet.user_id = follower.following_user_id INNER JOIN like ON like.tweet_id = tweet.tweet_id
    INNER JOIN user ON user.user_id = like.user_id
    WHERE
    tweet.tweet_id = ${tweetId} AND follower.follower_user_id = ${user_id};`;

    const likedUsers = await db.all(getLikedUserQuery);

    if (likedUsers.length !== 0) {
      let likes = [];
      const getNamesArray = (likedUsers) => {
        for (let item of likedUsers) {
          likes.push(item.username);
        }
      };
      getNamesArray(likedUsers);
      response.send({ likes });
    } else {
      response.status(401);
      response.send("Invalid Request");
    }
  }
);

//API8
app.get(
  "/tweets/:tweetId/replies/",
  authentication,
  tweetAccessVerification,
  async (request, response) => {
    const { tweetId } = request;
    const { payload } = request;
    const { user_id, name, username, gender } = payload;

    const getRepliedUsersQuery = `
    SELECT
    *
    FROM
    follower INNER JOIN tweet ON tweet.user_id = follower.following_user_id INNER JOIN reply ON reply.tweet_id = tweet.tweet_id
    INNER JOIN user ON user.user_id = reply.user_id
    WHERE
    tweet.tweet_id = ${tweetId} AND follower.follower_user_id = ${user_id};`;

    const repliedUsers = await db.all(getRepliedUsersQuery);

    if (repliedUsers.length !== 0) {
      let replies = [];
      const getNamesArray = (repliedUsers) => {
        for (let item of repliedUsers) {
          let object = {
            name: item.name,
            reply: item.reply,
          };
          replies.push(object);
        }
      };
      getNamesArray(repliedUsers);
      response.send({ replies });
    } else {
      response.status(401);
      response.send("Invalid Request");
    }
  }
);

//API9
app.get("/user/tweets/", authentication, async (request, response) => {
  const { payload } = request;
  const { user_id, name, username, gender } = payload;

  const getTweetsQuery = `
    SELECT
    tweet.tweet AS tweet,
    COUNT(DISTINCT (like.like_id)) AS likes,
    COUNT(DISTINCT (reply.reply_id)) AS replies,
    tweet.date_time AS dateTime
    FROM
    user INNER JOIN tweet ON user.user_id = tweet.user_id INNER JOIN like ON like.tweet_id INNER JOIN reply ON reply.tweet_id = tweet.tweet_id
    WHERE
    user.user_id = ${user_id}
    GROUP BY
    tweet.tweet_id;`;

  const tweetsDetails = await db.all(getTweetsQuery);
  response.send(tweetsDetails);
});

//API10
app.post("/user/tweets/", authentication, async (request, response) => {
  const { tweet } = request;
  const { tweetId } = request;
  const { payload } = request;
  const { user_id, name, username, gender } = payload;

  const postTweetQuery = `
    INSERT INTO 
    tweet (tweet,user_id)
    VALUES
    ('${tweet}',
    '${user_id}');`;

  await db.run(postTweetQuery);
  response.send("Created a Tweet");
});

//API11
app.delete("/tweets/:tweetId/", authentication, async (request, response) => {
  const { tweetId } = request;
  const { payload } = request;
  const { user_id, name, username, gender } = payload;

  const selectUserQuery = `
    SELECT
    *
    FROM
    tweet
    WHERE
    tweet.user_id = ${user_id} AND tweet.tweet_id = ${tweetId};`;

  const tweetUser = await db.all(selectUserQuery);

  if (tweetUser.length !== 0) {
    const deleteTweetQuery = `
        DELETE FROM tweet
        WHERE
        tweet.user_id = ${user_id} AND tweet.tweet_id = ${tweetId};`;

    await db.run(deleteTweetQuery);
    response.send("Tweet Removed");
  } else {
    response.status(401);
    response.send("Invalid Request");
  }
});

module.exports = app;
