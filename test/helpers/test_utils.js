var eventObj = {
    key: "event_check",
    count: 55,
    sum: 3.14,
    dur: 2000,
    segmentation: {
        string_value: "example",
        number_value: 42,
        boolean_value: true,
        array_value: ["item1", "item2"],
        object_value: { nested_key: "nested_value" },
        null_value: null,
        undefined_value: undefined,
    },
};

var timedEventObj = {
    key: "timed",
    count: 1,
    segmentation: {
        app_version: "1.0",
        country: "Turkey",
    },
};

var userDetailObj = {
    name: "Alexandrina Jovovich",
    username: "alex_jov",
    email: "alex.jov@example.com",
    organization: "TechNova",
    phone: "+987654321",
    picture: "https://example.com/images/profile_alex.jpg",
    gender: "Female",
    byear: 1992,
    custom: {
        string_value: "example",
        number_value: 42,
        boolean_value: true,
        array_value: ["item1", "item2"],
        object_value: { nested_key: "nested_value" },
    },
};

var getUserDetailsObj = function() {
    return userDetailObj;
};

var getEventObj = function() {
    return eventObj;
};

var getTimedEventObj = function() {
    return timedEventObj;
};

module.exports = {
    getEventObj,
    getUserDetailsObj,
    getTimedEventObj,
};