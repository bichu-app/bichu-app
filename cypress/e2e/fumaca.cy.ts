describe('fumaca', () => {
  it('a API responde /v1/health', () => {
    cy.request('/v1/health').its('status').should('eq', 200);
  });
});
