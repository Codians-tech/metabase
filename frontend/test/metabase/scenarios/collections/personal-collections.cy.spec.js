import _ from "underscore";
import { restore, popover, modal } from "__support__/e2e/cypress";
import { USERS } from "__support__/e2e/cypress_data";
import { getSidebarCollectionChildrenFor } from "./utils";

describe("personal collections", () => {
  beforeEach(() => {
    restore();
    cy.server();
  });

  describe("admin", () => {
    beforeEach(() => {
      cy.signInAsAdmin();
      // Turn normal user into another admin
      cy.request("PUT", "/api/user/2", {
        is_superuser: true,
      });
    });

    it("should be able to view their own as well as other users' personal collections (including other admins)", () => {
      cy.visit("/collection/root");
      cy.findByText("Your personal collection");
      cy.findByText("Other users' personal collections").click();
      cy.location("pathname").should("eq", "/collection/users");
      cy.findByText(/All personal collections/i);
      Object.values(USERS).forEach(user => {
        const FULL_NAME = `${user.first_name} ${user.last_name}`;
        cy.findByText(FULL_NAME);
      });
    });

    it("shouldn't be able to change permission levels or edit personal collections", () => {
      cy.visit("/collection/root");
      cy.findByText("Your personal collection").click();
      cy.icon("new_folder");
      cy.icon("lock").should("not.exist");
      cy.icon("pencil").should("not.exist");
      // Visit random user's personal collection
      cy.visit("/collection/5");
      cy.icon("new_folder");
      cy.icon("lock").should("not.exist");
      cy.icon("pencil").should("not.exist");
    });

    it.skip("shouldn't be able to change permission levels for sub-collections in personal collections (metabase#8406)", () => {
      cy.visit("/collection/root");
      cy.findByText("Your personal collection").click();
      // Create new collection inside admin's personal collection and navigate to it
      addNewCollection("Foo");
      cy.get("[class*=CollectionSidebar]")
        .findByText("Foo")
        .click();
      cy.icon("new_folder");
      cy.icon("pencil");
      cy.icon("lock").should("not.exist");
    });

    it("should be able view other users' personal sub-collections (metabase#15339)", () => {
      const normalUser = USERS.normal;
      const fullName = `${normalUser.first_name} ${normalUser.last_name}`;
      const personalCollection = `${fullName}'s Personal Collection`;
      const otherUsers = Object.values(_.omit(USERS, "normal"));

      cy.visit("/collection/root");
      cy.findByText("Other users' personal collections").click();
      cy.findByText(fullName).click();

      cy.icon("new_folder").click();
      cy.findByLabelText("Name").type("Foo");
      cy.findByText("Create").click();

      getSidebarCollectionChildrenFor(personalCollection).findByText("Foo");

      // Ensure only selected user's collection is visible at the moment
      otherUsers.forEach(user => {
        const collection = `${user.first_name} ${user.last_name}'s Personal Collection`;
        cy.findByTestId("sidebar")
          .findByText(collection)
          .should("not.exist");
      });

      // Frontend makes a few requests needed to correctly display the collections tree
      // This test ensures intermediate loading states are handled and the page doesn't crash
      cy.reload();
      getSidebarCollectionChildrenFor(personalCollection).findByText("Foo");

      // Another user's personal collection has to disappear once a user switches to another collection
      cy.findByTestId("sidebar")
        .findByText("Our analytics")
        .click();
      cy.findByTestId("sidebar")
        .findByText(personalCollection)
        .should("not.exist");
    });
  });

  describe("all users", () => {
    Object.keys(USERS).forEach(user => {
      describe(`${user} user`, () => {
        beforeEach(() => {
          cy.signIn(user);
          cy.visit("/collection/root");
          cy.findByText("Your personal collection").click();
          // Create initial collection inside the personal collection and navigate inside it
          addNewCollection("Foo");
          cy.get("[class*=CollectionSidebar]")
            .as("sidebar")
            .findByText("Foo")
            .click();
        });

        it("should be able to edit collection(s) inside personal collection", () => {
          // Create new collection inside previously added collection
          addNewCollection("Bar");
          cy.get("@sidebar")
            .findByText("Bar")
            .click();
          cy.icon("pencil").click();
          /**
           * We're testing a few things here:
           *  1. editing collection's title
           *  2. editing collection's description and
           *  3. moving that collection within personal collection
           */
          cy.findByText("Edit this collection").click();
          modal().within(() => {
            cy.findByLabelText("Name") /* [1] */
              .click()
              .type("1");

            cy.findByLabelText("Description") /* [2] */
              .click()
              .type("ex-bar");
            cy.get(".AdminSelect").click();
          });
          popover()
            .findByText("My personal collection") /* [3] */
            .click();
          cy.button("Update").click();
          // Clicking on "Foo" would've closed it and would hide its sub-collections (if there were any).
          // By doing this, we're making sure "Bar" lives at the same level as "Foo"
          cy.get("@sidebar")
            .findByText("Foo")
            .click();
          cy.get("@sidebar").findByText("Bar1");
        });

        it("should be able to archive collection(s) inside personal collection (metabase#15343)", () => {
          cy.icon("pencil").click();
          cy.findByText("Archive this collection").click();
          modal()
            .findByRole("button", { name: "Archive" })
            .click();
          cy.findByText("Archived collection");
          cy.get("@sidebar")
            .findByText("Foo")
            .should("not.exist");
        });
      });
    });
  });
});

function addNewCollection(name) {
  cy.icon("new_folder").click();
  cy.findByLabelText("Name").type(name);
  cy.findByText("Create").click();
}
