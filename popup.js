let textarea = document.getElementById("usernames");
let infoText = document.getElementById("infoText");
let errorText = document.getElementById("errorText");
let groupName = document.getElementById("groupName");
let groupSelect = document.getElementById("groupSelect");
let groupBody = document.getElementById("groupBody");
let createGroupBtn = document.getElementById("createGroupBtn");
let deleteGroupBtn = document.getElementById("deleteGroupBtn");
let accessKey = document.getElementById("accessKey");

accessKey.oninput = (e) => {
  chrome.storage.sync.set({ accessKey: e.target.value });
};
const parseUsernames = () => {
  const usernames = textarea.value;
  return usernames.split(",").map((name) => name.trim());
};

let loaded = true;
let currentGroupNumber = 0;
let numberOfGroups = 0;
let groups = {};

const loadGroup = (targetGroupNumber) => {
  currentGroupNumber = targetGroupNumber;

  chrome.storage.sync.set({ selectedGroup: currentGroupNumber });
  chrome.storage.sync.get("groups").then((groupsData) => {
    const data = groupsData.groups;
    groups = data;
    loaded = true;
    if (data) {
      groupSelect.innerHTML = undefined;
      Object.entries(data).forEach(([key, value]) => {
        const option = document.createElement("option");
        option.value = key;
        option.innerText = value.groupName;
        groupSelect.appendChild(option);
      });
      groupSelect.value = currentGroupNumber;
      textarea.value = data[currentGroupNumber]?.usernames;
      groupName.value = data[currentGroupNumber]?.groupName;
      textarea.value = parseUsernames().join(",\n");
    } else if (numberOfGroups < 1) {
      groupBody.style = "display: none;";
    }
  });
};

// chrome.storage.sync.remove("selectedGroup");
// chrome.storage.sync.remove("numberOfGroups");
// chrome.storage.sync.remove("groups");

chrome.storage.sync.get("selectedGroup").then((data) => {
  currentGroupNumber = data.selectedGroup || currentGroupNumber;
  loadGroup(currentGroupNumber);
});
chrome.storage.sync.get("numberOfGroups").then((data) => {
  numberOfGroups = data.numberOfGroups || numberOfGroups;
});
chrome.storage.sync.get("accessKey").then((data) => {
  accessKey.value = data.accessKey;
});

textarea.oninput = function (e) {
  chrome.storage.sync.get("groups").then((groupsData) => {
    chrome.storage.sync.set({
      groups: {
        ...groups,
        [currentGroupNumber]: {
          groupName: groupName.value,
          usernames: e.target.value,
        },
      },
    });
  });
};
textarea.onblur = function (e) {
  textarea.value = parseUsernames().join(",\n");
};

groupName.oninput = function (e) {
  if (loaded) {
    chrome.storage.sync.get("groups").then((groupsData) => {
      chrome.storage.sync
        .set({
          groups: {
            ...groups,
            [currentGroupNumber]: {
              groupName: e.target.value,
              usernames: textarea.value,
            },
          },
        })
        .then(() => loadGroup(currentGroupNumber));
    });
  }
};

createGroupBtn.onclick = function (e) {
  chrome.storage.sync.set({ selectedGroup: numberOfGroups + 1 }).then(() => {
    currentGroupNumber = numberOfGroups + 1;
    chrome.storage.sync
      .set({
        numberOfGroups: numberOfGroups + 1,
      })
      .then(() => {
        numberOfGroups++;
        chrome.storage.sync
          .set({
            groups: {
              ...groups,
              [currentGroupNumber]: {
                groupName: `Group ${currentGroupNumber}`,
                usernames: "",
              },
            },
          })
          .then(() => {
            groupBody.style = "display: unset;";
            loadGroup(currentGroupNumber);
          });
      });
  });
};

deleteGroupBtn.onclick = function (e) {
  const deletedGroupNumber = currentGroupNumber;
  chrome.storage.sync
    .set({ selectedGroup: !numberOfGroups ? 0 : numberOfGroups - 1 })
    .then(() => {
      currentGroupNumber = !numberOfGroups ? 0 : numberOfGroups - 1;
      chrome.storage.sync
        .set({
          numberOfGroups: !numberOfGroups ? 0 : numberOfGroups - 1,
        })
        .then(() => {
          numberOfGroups = !numberOfGroups ? 0 : numberOfGroups - 1;
          if (numberOfGroups - 1 >= 0) {
            delete groups[deletedGroupNumber];
            currentGroupNumber =
              Object.keys(groups)[Object.keys(groups).length - 1];

            chrome.storage.sync
              .set({
                groups,
              })
              .then(() => {
                loadGroup(currentGroupNumber);
              });
          } else {
            chrome.storage.sync.remove("selectedGroup");
            chrome.storage.sync.remove("numberOfGroups");
            chrome.storage.sync.remove("groups");
            groupSelect.innerHTML = undefined;
            groupBody.style = "display: none;";
          }
        });
    });
};

groupSelect.onchange = function (e) {
  loadGroup(e.target.value);
};

const getUserIds = async () => {
  usernames = parseUsernames();
  const ids = [];
  const promises = [];
  const usersNotFound = [];
  usernames.forEach((username) => {
    promises.push(
      fetch(`https://api.github.com/users/${username}`, {
        headers: {
          authorization: `token ${accessKey.value}`,
        },
      }).then(async function (response) {
        const json = await response.json();
        const userId = json.id;
        ids.push(userId);
        if (!userId) {
          usersNotFound.push(username);
        }
      })
    );
  });
  Promise.all(promises).finally(() => {
    chrome.tabs.query(
      {
        active: true,
        currentWindow: true,
      },
      function (tabs) {
        const usersFound = usernames.filter(
          (username) => !usersNotFound.includes(username)
        );
        var tab = tabs[0];
        let fetchURL = `${
          tab.url.slice(0, tab.url.indexOf("com") + 3) +
          "/repos" +
          tab.url.slice(tab.url.indexOf("com") + 3)
        }/requested_reviewers`;
        fetchURL = fetchURL.replace("pull", "pulls");
        fetchURL = fetchURL.replace("://", "://api.");
        fetch(fetchURL, {
          method: "POST",
          headers: {
            authorization: `token ${accessKey.value}`,
          },
          body: JSON.stringify({
            reviewers: usersFound,
          }),
        })
          .then((response) => {
            if (response.ok) return response.json();
            else throw response;
          })
          .then((r) => {
            if (usersFound) {
              infoText.innerText =
                "The following users were added as reviewers: " +
                usersFound.join(", ").trim();
            }
            if (usersNotFound.length > 0) {
              errorText.innerText =
                "The following users were not found: " +
                usersNotFound.join(", ").trim();
            }
          })
          .catch((e) => {
            if (e.status === 401) {
              errorText.innerText =
                "There was an auth error, please ensure you input a valid access key";
            } else
              errorText.innerText =
                "There was an error, please ensure your on a pull request page and try again";
          });
      }
    );
  });
};

let addReviewersBtn = document.getElementById("addReviewersBtn");

addReviewersBtn.onclick = () => {
  errorText.innerText = "";
  infoText.innerText = "";
  getUserIds();
};

let accessKeyLink = document.getElementById("accessKeyLink");

accessKeyLink.onclick = function (e) {
  e.preventDefault();
  chrome.tabs.create({
    url: "https://github.com/settings/tokens/new?scopes=repo",
    active: true,
  });
  return false;
};
